"""Conftest for auth tests — uses mongita (no Docker required)."""

import time

import pytest
import pytest_asyncio
from bson import ObjectId
from httpx import AsyncClient
from joserfc import jwt
from joserfc.jwk import KeySet, RSAKey

from tests.identity import session_headers
from toktagger.api import config
from toktagger.api.auth import oidc
from toktagger.api.models import check_models_enabled
from toktagger.api.schemas.models import ModelIn

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
    return auth


@pytest.fixture
def identity_provider(oidc_settings, monkeypatch) -> oidc.IdentityProvider:
    provider = oidc.IdentityProvider(oidc_settings)

    async def metadata():
        return {"issuer": ISSUER, "jwks_uri": JWKS_URL}

    monkeypatch.setattr(provider, "metadata", metadata)
    return provider


@pytest.fixture
def registered_idp(unauthenticated_api_client, identity_provider):
    """The identity provider, registered on the test app as the lifespan does."""
    unauthenticated_api_client.app.state.idp = identity_provider
    return identity_provider


@pytest.fixture
def jwks_route(respx_mock, idp_key):
    return respx_mock.get(JWKS_URL).respond(json=KeySet([idp_key]).as_dict())


@pytest.fixture
def idp(registered_idp, monkeypatch):
    """The registered Authlib client with discovery preloaded and its token calls faked."""
    client = registered_idp.client
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

    monkeypatch.setattr(registered_idp, "metadata", get_metadata)
    client.fake_token = {
        "refresh_token": "refresh-1",
        "id_token": "id-token-1",
        "userinfo": {
            "sub": "sub-1",
            "preferred_username": "alice",
            "email": "alice@example.com",
            "name": "Alice Example",
            "groups": [],
        },
    }
    client.fake_userinfo = {}
    client.fake_refresh: dict | Exception = {"refresh_token": "refresh-2"}
    client.refresh_calls = []

    async def authorize_access_token(request):
        if isinstance(client.fake_token, Exception):
            raise client.fake_token
        return client.fake_token

    async def fetch_access_token(grant_type, refresh_token):
        client.refresh_calls.append(refresh_token)
        if isinstance(client.fake_refresh, Exception):
            raise client.fake_refresh
        return client.fake_refresh

    async def userinfo(token=None):
        return client.fake_userinfo

    monkeypatch.setattr(client, "authorize_access_token", authorize_access_token)
    monkeypatch.setattr(client, "fetch_access_token", fetch_access_token)
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


async def add_member(
    client: AsyncClient, token: str, project_id: str, username: str, role: str
) -> None:
    """Add `username` to `project_id` with `role`, authenticated as `token`."""
    resp = await client.post(
        f"/projects/{project_id}/members",
        json={"username": username, "role": role},
        headers=session_headers(token),
    )
    assert resp.status_code == 200, resp.text


@pytest_asyncio.fixture
async def model_status_url(setup_db_auth, unauthenticated_api_client, db_client):
    """The model status route Ray workers call back on, with the models-enabled gate lifted."""
    project_id = setup_db_auth["project_id"]
    # model_construct: ModelIn's type validator needs the optional models registry.
    model = ModelIn.model_construct(
        type="disruption_cnn", version=1, status="training", progress=0, score=0
    )
    model_id = await db_client.insert(
        "models", model, ids={"project_id": ObjectId(project_id)}
    )
    overrides = unauthenticated_api_client.app.dependency_overrides
    overrides[check_models_enabled] = lambda: None
    yield f"/projects/{project_id}/models/{model_id}"
    overrides.pop(check_models_enabled, None)
