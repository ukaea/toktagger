import asyncio
import base64
import json
import logging
import time
from typing import Any, Literal

import httpx
from authlib.integrations.base_client.errors import OAuthError
from authlib.integrations.starlette_client import OAuth, StarletteOAuth2App
from fastapi import HTTPException
from joserfc import jwt
from joserfc.errors import JoseError
from joserfc.jwk import KeySet

from toktagger.api import config
from toktagger.api.crud import utils
from toktagger.api.crud.db import MongoDBClient
from toktagger.api.schemas.users import UserIn, UserOut

logger = logging.getLogger(__name__)

IDP_NAME = "idp"
JWKS_TTL_SECONDS = 600
JWKS_MIN_REFRESH_SECONDS = 30
SIGNING_ALGORITHMS = [
    "RS256",
    "RS384",
    "RS512",
    "PS256",
    "PS384",
    "PS512",
    "ES256",
    "ES384",
    "ES512",
    "EdDSA",
]
RESERVED_USERNAME_PREFIXES = ("model::", "annotators::", "__")

try:
    import httpx2
except ImportError:
    httpx2 = httpx

# Authlib uses httpx2 when it is installed, so its network errors are not httpx errors
IDP_ERRORS = (OAuthError, httpx.HTTPError, httpx2.HTTPError)

_oauth: OAuth | None = None
_jwks: KeySet | None = None
_jwks_fetched_at = 0.0


def register_idp() -> None:
    """Register the configured identity provider, replacing any earlier one."""
    global _oauth, _jwks, _jwks_fetched_at
    auth = config.settings.auth
    issuer = str(auth.issuer_url).rstrip("/")
    _oauth = OAuth()
    _oauth.register(
        name=IDP_NAME,
        server_metadata_url=f"{issuer}/.well-known/openid-configuration",
        client_id=auth.client_id,
        client_secret=auth.client_secret,
        client_kwargs={"scope": auth.scopes, "code_challenge_method": "S256"},
    )
    _jwks = None
    _jwks_fetched_at = 0.0


def idp_registered() -> bool:
    return _oauth is not None


def get_idp() -> StarletteOAuth2App:
    if _oauth is None:
        raise RuntimeError("The identity provider is not registered")
    return getattr(_oauth, IDP_NAME)


async def get_metadata() -> dict[str, Any]:
    return await get_idp().load_server_metadata()


async def connect_idp(timeout_seconds: float = 20) -> None:
    """Wait for the provider discovery document, which a managed server may be slow to serve."""
    deadline = time.monotonic() + timeout_seconds
    delay = 0.5
    while True:
        try:
            await get_metadata()
            return
        except IDP_ERRORS as error:
            if time.monotonic() + delay > deadline:
                issuer = config.settings.auth.issuer_url
                raise RuntimeError(
                    f"Could not reach the identity provider at {issuer}: {error}"
                ) from error
            await asyncio.sleep(delay)
            delay = min(delay * 2, 4)


async def fetch_jwks(force: bool = False) -> KeySet:
    """Return the provider signing keys, cached for JWKS_TTL_SECONDS.

    A forced refresh is skipped when the keys were fetched less than
    JWKS_MIN_REFRESH_SECONDS ago, so tokens with random key ids cannot make
    the server hit the provider on every request.
    """
    global _jwks, _jwks_fetched_at
    age = time.monotonic() - _jwks_fetched_at
    if _jwks is not None and age <= JWKS_TTL_SECONDS:
        if not force or age <= JWKS_MIN_REFRESH_SECONDS:
            return _jwks
    metadata = await get_metadata()
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(metadata["jwks_uri"])
        response.raise_for_status()
    _jwks = KeySet.import_key_set(response.json())
    _jwks_fetched_at = time.monotonic()
    return _jwks


def _token_key_id(token: str) -> str | None:
    header_segment = token.split(".")[0]
    padded = header_segment + "=" * (-len(header_segment) % 4)
    header = json.loads(base64.urlsafe_b64decode(padded))
    key_id = header.get("kid")
    return key_id if isinstance(key_id, str) else None


def _audience_matches(claims: dict[str, Any], client_id: str) -> bool:
    audience = claims.get("aud") or []
    if isinstance(audience, str):
        audience = [audience]
    return client_id in audience or claims.get("azp") == client_id


async def verify_access_token(token: str) -> dict[str, Any]:
    """Verify a provider-issued JWT and return its claims.

    Raises ValueError when the token is malformed, has an unknown signing key,
    a bad signature, a wrong issuer or audience, or has expired.
    """
    auth = config.settings.auth
    try:
        key_id = _token_key_id(token)
        keys = await fetch_jwks()
        if key_id is not None and not _has_key(keys, key_id):
            keys = await fetch_jwks(force=True)
            if not _has_key(keys, key_id):
                raise ValueError("Unknown signing key")
        decoded = jwt.decode(token, keys, algorithms=SIGNING_ALGORITHMS)
        issuer = (await get_metadata())["issuer"]
        jwt.JWTClaimsRegistry(
            iss={"essential": True, "value": issuer},
            exp={"essential": True},
        ).validate(decoded.claims)
    except (JoseError, KeyError, TypeError, httpx.HTTPError) as error:
        raise ValueError("Invalid token") from error
    if auth.verify_bearer_audience and not _audience_matches(
        decoded.claims, auth.client_id
    ):
        raise ValueError("Invalid token audience")
    return decoded.claims


def _has_key(keys: KeySet, key_id: str) -> bool:
    try:
        keys.get_by_kid(key_id)
    except (ValueError, JoseError):
        return False
    return True


def extract_roles(claims: dict[str, Any], path: str) -> list[str]:
    """Read the groups or roles at a dotted path in the claims.

    Keycloak can emit group paths such as /toktagger-admins, so one leading
    slash is removed from each value.
    """
    value: Any = claims.get(path)
    if value is None:
        value = claims
        for part in path.split("."):
            if not isinstance(value, dict) or part not in value:
                return []
            value = value[part]
    items = value if isinstance(value, list) else [value]
    return [item.removeprefix("/") for item in items if isinstance(item, str)]


def _strip_reserved_prefixes(name: str) -> str:
    stripped = name.strip()
    changed = True
    while changed:
        changed = False
        for prefix in RESERVED_USERNAME_PREFIXES:
            if stripped.startswith(prefix):
                stripped = stripped.removeprefix(prefix).lstrip("_")
                changed = True
    return stripped


def derive_username(claims: dict[str, Any]) -> str:
    email = claims.get("email")
    candidates = (
        claims.get("preferred_username"),
        email.split("@")[0] if isinstance(email, str) else None,
        claims.get("sub"),
    )
    for candidate in candidates:
        if isinstance(candidate, str) and (name := _strip_reserved_prefixes(candidate)):
            return name
    return "user"


async def _create_with_free_username(db_client: MongoDBClient, user: UserIn) -> str:
    base_name = user.username
    suffix = 1
    while True:
        username = base_name if suffix == 1 else f"{base_name}{suffix}"
        try:
            return await utils.create_user(
                db_client, user.model_copy(update={"username": username})
            )
        except HTTPException as error:
            if error.status_code != 409:
                raise
            suffix += 1


async def provision_user(
    db_client: MongoDBClient, issuer: str, claims: dict[str, Any]
) -> UserOut:
    """Create or update the local user for an identity provider account.

    The username is chosen at first sign-in and never changed afterwards, because
    annotations store it in created_by. The global role follows the provider's
    groups on every call. A local is_active=False is not changed here.
    """
    sub = claims.get("sub")
    if not isinstance(sub, str) or not sub:
        raise ValueError("Token has no subject")
    auth = config.settings.auth
    global_role: Literal["admin", "user"] = (
        "admin"
        if auth.admin_group in extract_roles(claims, auth.roles_claim)
        else "user"
    )
    email = claims.get("email") if isinstance(claims.get("email"), str) else None
    display_name = claims.get("name") if isinstance(claims.get("name"), str) else None

    async with db_client.lock(f"users:oidc:{issuer}:{sub}"):
        user = await utils.get_user_by_oidc_identity(db_client, issuer, sub)
        if user is None:
            base_name = derive_username(claims)
            user = await utils.adopt_legacy_user(db_client, base_name, issuer, sub)
            if user is not None:
                logger.info(
                    "Linked existing user %s to identity %s", user.username, sub
                )
            else:
                new_user = UserIn(
                    username=base_name,
                    oidc_issuer=issuer,
                    oidc_sub=sub,
                    global_role=global_role,
                    email=email,
                    display_name=display_name,
                )
                user_id = await _create_with_free_username(db_client, new_user)
                created = await utils.get_user_by_id(db_client, user_id)
                if created is None:
                    raise RuntimeError("Created user could not be read back")
                return created
        return await utils.sync_user_from_idp(
            db_client, user.id, global_role, email, display_name
        )
