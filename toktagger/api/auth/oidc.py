import asyncio
import base64
import json
import logging
import time
from typing import Any, Literal

import httpx
from authlib.integrations.base_client.errors import OAuthError
from authlib.integrations.starlette_client import OAuth, StarletteOAuth2App
from fastapi import HTTPException, Request
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
RESERVED_USERNAME_PREFIXES = ("__", "model::", "annotators::")

try:
    import httpx2
except ImportError:
    httpx2 = httpx

# Authlib uses httpx2 when it is installed, so its network errors are not httpx errors
IDP_ERRORS = (OAuthError, httpx.HTTPError, httpx2.HTTPError)


class IdentityProvider:
    """The OpenID Connect provider client and its cached signing keys."""

    def __init__(self, auth: config.Auth) -> None:
        self._auth_settings = auth
        issuer = str(auth.issuer_url).rstrip("/")
        oauth = OAuth()
        oauth.register(
            name=IDP_NAME,
            server_metadata_url=f"{issuer}/.well-known/openid-configuration",
            client_id=auth.client_id,
            client_secret=auth.client_secret,
            client_kwargs={"scope": auth.scopes, "code_challenge_method": "S256"},
        )
        self.client: StarletteOAuth2App = oauth.create_client(IDP_NAME)
        self._jwks: KeySet | None = None
        self._jwks_fetched_at = 0.0

    async def metadata(self) -> dict[str, Any]:
        return await self.client.load_server_metadata()

    async def connect(self, timeout_seconds: float = 20) -> None:
        """Wait for the provider discovery document, which a managed server may be slow to serve."""
        deadline = time.monotonic() + timeout_seconds
        delay = 0.5
        while True:
            try:
                await self.metadata()
                return
            except IDP_ERRORS as error:
                if time.monotonic() + delay > deadline:
                    raise RuntimeError(
                        f"Could not reach the identity provider at {self._auth_settings.issuer_url}: {error}"
                    ) from error
                await asyncio.sleep(delay)
                delay = min(delay * 2, 4)

    async def fetch_jwks(self, force: bool = False) -> KeySet:
        """Return the provider signing keys, cached for JWKS_TTL_SECONDS.

        A forced refresh is skipped when the keys were fetched less than
        JWKS_MIN_REFRESH_SECONDS ago, so tokens with random key ids cannot make
        the server hit the provider on every request.
        """
        age = time.monotonic() - self._jwks_fetched_at
        is_stale = self._jwks is None or age > JWKS_TTL_SECONDS
        is_refresh_allowed = force and age > JWKS_MIN_REFRESH_SECONDS
        if is_stale or is_refresh_allowed:
            metadata = await self.metadata()
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(metadata["jwks_uri"])
                response.raise_for_status()
            self._jwks = KeySet.import_key_set(response.json())
            self._jwks_fetched_at = time.monotonic()
        return self._jwks

    async def verify_access_token(self, token: str) -> dict[str, Any]:
        """Verify a provider-issued JWT and return its claims.

        Raises ValueError when the token is malformed, has an unknown signing key,
        a bad signature, a wrong issuer or audience, or has expired.
        """
        try:
            key_id = _token_key_id(token)
            keys = await self.fetch_jwks()
            if key_id is not None and not _has_key(keys, key_id):
                keys = await self.fetch_jwks(force=True)
                if not _has_key(keys, key_id):
                    raise ValueError("Unknown signing key")
            decoded = jwt.decode(token, keys, algorithms=SIGNING_ALGORITHMS)
            issuer = (await self.metadata())["issuer"]
            _validate_claims(decoded.claims, issuer)
        except (JoseError, KeyError, TypeError, httpx.HTTPError) as error:
            raise ValueError("Invalid token") from error
        if self._auth_settings.verify_bearer_audience and not _audience_matches(
            decoded.claims, self._auth_settings.client_id
        ):
            raise ValueError("Invalid token audience")
        return decoded.claims


def get_idp(request: Request) -> IdentityProvider:
    """Return the identity provider that the app registered at startup."""
    idp: IdentityProvider | None = request.app.state.idp
    if idp is None:
        raise RuntimeError("The identity provider is not registered")
    return idp


def _token_key_id(token: str) -> str | None:
    header_segment = token.split(".")[0]
    padded = header_segment + "=" * (-len(header_segment) % 4)
    header = json.loads(base64.urlsafe_b64decode(padded))
    if not isinstance(header, dict):
        raise ValueError("Invalid token")
    key_id = header.get("kid")
    return key_id if isinstance(key_id, str) else None


def _validate_claims(claims: dict[str, Any], issuer: str) -> None:
    """Check the issuer, expiry, not-before and issued-at claims of a token."""
    registry = jwt.JWTClaimsRegistry(
        iss={"essential": True, "value": issuer},
        exp={"essential": True},
    )
    registry.validate(claims)
    if "nbf" in claims:
        registry.validate_nbf(claims["nbf"])
    if "iat" in claims:
        registry.validate_iat(claims["iat"])


def _audience_matches(claims: dict[str, Any], client_id: str) -> bool:
    audience = claims.get("aud") or []
    if isinstance(audience, str):
        audience = [audience]
    authorised_party = claims.get("azp")
    return client_id in audience and authorised_party in (None, client_id)


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
    for prefix in RESERVED_USERNAME_PREFIXES:
        stripped = stripped.removeprefix(prefix)
    return stripped


def derive_username(claims: dict[str, Any]) -> str:
    email = claims.get("email")
    full_name = claims.get("name")
    candidates = (
        claims.get("preferred_username"),
        email.split("@")[0] if isinstance(email, str) else None,
        full_name.replace(" ", "") if isinstance(full_name, str) else None,
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


async def _warn_if_last_admin_demoted(
    db_client: MongoDBClient, user: UserOut, global_role: Literal["admin", "user"]
) -> None:
    if user.global_role != "admin" or not user.is_active or global_role == "admin":
        return
    other_admins = [
        other
        for other in await utils.get_all_users(db_client)
        if other.global_role == "admin" and other.is_active and other.id != user.id
    ]
    if not other_admins:
        logger.warning(
            f"The identity provider removed {user.username} from "
            f"{config.settings.auth.admin_group}, so TokTagger has no active "
            f"admin. Add a user to {config.settings.auth.admin_group} at the "
            "provider to give admin access again."
        )


async def provision_user(
    db_client: MongoDBClient,
    issuer: str,
    claims: dict[str, Any],
    sync_profile: bool = True,
) -> UserOut:
    """Create or update the local user for an identity provider account.

    The username is chosen at first sign-in and never changed afterwards, so it stays
    the same where people see it. With sync_profile, the global role, email
    and display name follow the claims; access tokens often omit those claims, so
    bearer callers turn it off. A local is_active=False is not changed here.
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
    email = claims.get("email")
    display_name = claims.get("name")

    async with db_client.lock(f"users:oidc:{issuer}:{sub}"):
        user = await utils.get_user_by_oidc_identity(db_client, issuer, sub)
        if user is None:
            new_user = UserIn(
                username=derive_username(claims),
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
        if not sync_profile:
            return user
        await _warn_if_last_admin_demoted(db_client, user, global_role)
        return await utils.sync_user_from_idp(
            db_client, user.id, global_role, email, display_name
        )
