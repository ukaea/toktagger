"""Conftest for auth tests — uses mongita (no Docker required)."""

import time

import pytest
from httpx import AsyncClient
from joserfc import jwt
from joserfc.jwk import KeySet, RSAKey

from toktagger.api import config
from toktagger.api.auth import oidc
from toktagger.api.auth.core import create_access_token

ISSUER = "https://idp.example.com/realms/toktagger"
JWKS_URL = f"{ISSUER}/protocol/openid-connect/certs"
CLIENT_ID = "toktagger"
AUTHORIZE_URL = f"{ISSUER}/protocol/openid-connect/auth"
END_SESSION_URL = f"{ISSUER}/protocol/openid-connect/logout"
PUBLIC_URL = "http://localhost:8002"


@pytest.fixture(scope="module")
def idp_key() -> RSAKey:
    return RSAKey.generate_key(2048, auto_kid=True)


@pytest.fixture
def oidc_settings(monkeypatch, settings):
    auth = config.Auth(
        provider="oidc",
        issuer_url=ISSUER,
        client_id=CLIENT_ID,
        client_secret="secret",
    )
    monkeypatch.setattr(config.settings, "auth", auth)

    async def get_metadata():
        return {"issuer": ISSUER, "jwks_uri": JWKS_URL}

    monkeypatch.setattr(oidc, "get_metadata", get_metadata)
    for name, value in (("_oauth", None), ("_jwks", None), ("_jwks_fetched_at", 0.0)):
        monkeypatch.setattr(oidc, name, value)
    oidc.register_idp()
    return auth


@pytest.fixture
def jwks_route(respx_mock, idp_key):
    return respx_mock.get(JWKS_URL).respond(json=KeySet([idp_key]).as_dict())


@pytest.fixture
def idp(oidc_settings, monkeypatch):
    """The registered Authlib client with discovery preloaded and its token calls faked."""
    client = oidc.get_idp()
    client.server_metadata = {
        "issuer": ISSUER,
        "authorization_endpoint": AUTHORIZE_URL,
        "token_endpoint": f"{ISSUER}/protocol/openid-connect/token",
        "jwks_uri": f"{ISSUER}/protocol/openid-connect/certs",
        "end_session_endpoint": END_SESSION_URL,
        "_loaded_at": time.time(),
    }

    async def get_metadata():
        return client.server_metadata

    monkeypatch.setattr(oidc, "get_metadata", get_metadata)
    client.fake_token = {
        "userinfo": {
            "sub": "sub-1",
            "preferred_username": "alice",
            "email": "alice@example.com",
            "name": "Alice Example",
            "groups": [],
        }
    }
    client.fake_userinfo = {}

    async def authorize_access_token(request):
        if isinstance(client.fake_token, Exception):
            raise client.fake_token
        return client.fake_token

    async def userinfo(token=None):
        return client.fake_userinfo

    monkeypatch.setattr(client, "authorize_access_token", authorize_access_token)
    monkeypatch.setattr(client, "userinfo", userinfo)
    return client


async def sign_in(client, return_to: str | None = "/ui/projects/7"):
    """Start the flow, so the flow cookie holds return_to, then hit the callback."""
    params = {} if return_to is None else {"return_to": return_to}
    start = await client.get("/auth/login", params=params)
    assert start.status_code == 302, start.text
    return await client.get("/auth/callback", params={"code": "c", "state": "s"})


def mint_token(key: RSAKey, **overrides) -> str:
    now = int(time.time())
    claims = {
        "iss": ISSUER,
        "sub": "user-1",
        "aud": [CLIENT_ID],
        "iat": now,
        "exp": now + 300,
    }
    claims.update(overrides)
    claims = {name: value for name, value in claims.items() if value is not None}
    return jwt.encode({"alg": "RS256", "kid": key.kid}, claims, key)


def get_auth_token(username: str) -> str:
    """A TokTagger session token for an existing user, sent as a bearer header.

    Callers share one client across identities and pass the token per request, so the
    client's cookie jar stays empty. Cookie auth is covered in test_cookie_auth.py.
    """
    return create_access_token({"sub": username})


async def add_member(
    client: AsyncClient, token: str, project_id: str, username: str, role: str
) -> None:
    """Add `username` to `project_id` with `role`, authenticated as `token`."""
    resp = await client.post(
        f"/projects/{project_id}/members",
        json={"username": username, "role": role},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
