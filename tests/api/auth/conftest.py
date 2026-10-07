"""Conftest for auth tests — uses mongita (no Docker required)."""

import time

import pytest
from httpx import AsyncClient
from joserfc import jwt
from joserfc.jwk import KeySet, RSAKey

from toktagger.api import config
from toktagger.api.auth import oidc

ISSUER = "https://idp.example.com/realms/toktagger"
JWKS_URL = f"{ISSUER}/protocol/openid-connect/certs"
CLIENT_ID = "toktagger"


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


async def get_auth_token(client: AsyncClient, username: str, password: str) -> str:
    """Obtain an access token for the given user.

    Callers share one client across identities and pass credentials per request as a
    bearer header, so the session cookie login also sets is dropped — left in the jar
    it would authenticate requests these tests intend to send as somebody else, or as
    nobody. Cookie auth is covered separately in test_cookie_auth.py.
    """
    resp = await client.post(
        "/auth/token",
        data={"username": username, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert resp.status_code == 200, f"Login failed ({username}): {resp.text}"
    client.cookies.clear()
    return resp.json()["access_token"]


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
