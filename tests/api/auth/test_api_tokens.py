"""Personal API tokens: management through a browser session, use as a Bearer token."""

import hashlib
import time
from datetime import datetime

import pytest
from pydantic import ValidationError

from tests.db_definitions import USER_ADMIN_ID, USER_ALICE_ID, USER_BOB_ID
from tests.identity import get_auth_token, session_headers
from toktagger.api import config
from toktagger.api.schemas.auth import ApiTokenCreate


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _create(client, user_id: str = USER_ALICE_ID, **body) -> dict:
    response = await client.post(
        "/users/me/tokens",
        json={"name": "laptop", **body},
        headers=session_headers(get_auth_token(user_id)),
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
async def test_created_token_authenticates_as_its_owner(
    unauthenticated_api_client, setup_db_auth
):
    client = unauthenticated_api_client
    created = await _create(client)
    assert created["token"].startswith("tt_")
    assert created["hint"] == created["token"][-4:]

    response = await client.get("/auth/me", headers=_bearer(created["token"]))
    assert response.status_code == 200
    assert response.json()["username"] == "alice"


@pytest.mark.asyncio
async def test_list_hides_the_token_and_other_users_tokens(
    unauthenticated_api_client, setup_db_auth
):
    client = unauthenticated_api_client
    created = await _create(client)
    await _create(client, user_id=USER_BOB_ID)

    response = await client.get(
        "/users/me/tokens", headers=session_headers(get_auth_token(USER_ALICE_ID))
    )
    assert response.status_code == 200
    tokens = response.json()
    assert [token["_id"] for token in tokens] == [created["_id"]]
    assert "token" not in tokens[0]
    assert "token_hash" not in tokens[0]


@pytest.mark.asyncio
async def test_only_the_hash_is_stored(
    unauthenticated_api_client, setup_db_auth, db_client
):
    created = await _create(unauthenticated_api_client)
    stored = await db_client.db["api_tokens"].find({}).to_list()
    assert len(stored) == 1
    assert created["token"] not in stored[0].values()
    assert (
        stored[0]["token_hash"] == hashlib.sha256(created["token"].encode()).hexdigest()
    )


@pytest.mark.asyncio
async def test_revoked_token_is_rejected(unauthenticated_api_client, setup_db_auth):
    client = unauthenticated_api_client
    created = await _create(client)
    response = await client.get("/auth/me", headers=_bearer(created["token"]))
    assert response.status_code == 200

    response = await client.delete(
        f"/users/me/tokens/{created['_id']}",
        headers=session_headers(get_auth_token(USER_ALICE_ID)),
    )
    assert response.status_code == 204

    response = await client.get("/auth/me", headers=_bearer(created["token"]))
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_cannot_revoke_another_users_token(
    unauthenticated_api_client, setup_db_auth
):
    client = unauthenticated_api_client
    created = await _create(client)

    response = await client.delete(
        f"/users/me/tokens/{created['_id']}",
        headers=session_headers(get_auth_token(USER_BOB_ID)),
    )
    assert response.status_code == 404

    response = await client.get("/auth/me", headers=_bearer(created["token"]))
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_expired_token_is_rejected(
    unauthenticated_api_client, setup_db_auth, db_client
):
    client = unauthenticated_api_client
    created = await _create(client)
    await db_client.db["api_tokens"].update_many(
        {}, {"$set": {"created_at": time.time() - 100, "expires_at": time.time() - 1}}
    )

    response = await client.get("/auth/me", headers=_bearer(created["token"]))
    assert response.status_code == 401
    assert await db_client.db["api_tokens"].count_documents({}) == 0


@pytest.mark.asyncio
async def test_unknown_token_is_rejected(unauthenticated_api_client, setup_db_auth):
    response = await unauthenticated_api_client.get(
        "/auth/me", headers=_bearer("tt_not-a-real-token")
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_token_of_deactivated_user_is_rejected(
    unauthenticated_api_client, setup_db_auth
):
    client = unauthenticated_api_client
    created = await _create(client)

    response = await client.put(
        f"/users/{setup_db_auth['alice_id']}",
        json={"is_active": False},
        headers=session_headers(get_auth_token(USER_ADMIN_ID)),
    )
    assert response.status_code == 200

    response = await client.get("/auth/me", headers=_bearer(created["token"]))
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_deleting_a_user_removes_their_tokens(
    unauthenticated_api_client, setup_db_auth, db_client
):
    client = unauthenticated_api_client
    await _create(client)
    assert await db_client.db["api_tokens"].count_documents({}) == 1

    response = await client.delete(
        f"/users/{setup_db_auth['alice_id']}",
        headers=session_headers(get_auth_token(USER_ADMIN_ID)),
    )
    assert response.status_code == 200
    assert await db_client.db["api_tokens"].count_documents({}) == 0


@pytest.mark.asyncio
async def test_api_token_cannot_manage_tokens(
    unauthenticated_api_client, setup_db_auth
):
    client = unauthenticated_api_client
    created = await _create(client)
    headers = _bearer(created["token"])

    assert (await client.get("/users/me/tokens", headers=headers)).status_code == 403
    response = await client.post(
        "/users/me/tokens", json={"name": "more"}, headers=headers
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_lifetime_above_maximum_is_rejected(
    unauthenticated_api_client, setup_db_auth
):
    max_days = config.settings.auth.api_token_max_lifetime_days
    response = await unauthenticated_api_client.post(
        "/users/me/tokens",
        json={"name": "laptop", "expires_in_days": max_days + 1},
        headers=session_headers(get_auth_token(USER_ALICE_ID)),
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_lifetime_at_maximum_is_accepted(
    unauthenticated_api_client, setup_db_auth
):
    max_days = config.settings.auth.api_token_max_lifetime_days
    before = time.time()
    created = await _create(unauthenticated_api_client, expires_in_days=max_days)
    expires_at = datetime.fromisoformat(created["expires_at"]).timestamp()
    assert expires_at == pytest.approx(before + max_days * 24 * 60 * 60, abs=60)


def test_default_max_lifetime_is_365_days(monkeypatch):
    default = type(config.settings.auth).model_fields["api_token_max_lifetime_days"]
    assert default.default == 365
    monkeypatch.setattr(config.settings.auth, "api_token_max_lifetime_days", 365)
    assert ApiTokenCreate(name="laptop", expires_in_days=365).expires_in_days == 365
    with pytest.raises(ValidationError, match="at most 365 days"):
        ApiTokenCreate(name="laptop", expires_in_days=366)


def test_create_schema_follows_configured_max_lifetime(monkeypatch):
    monkeypatch.setattr(config.settings.auth, "api_token_max_lifetime_days", 7)
    assert ApiTokenCreate(name="laptop", expires_in_days=7).expires_in_days == 7
    with pytest.raises(ValidationError, match="at most 7 days"):
        ApiTokenCreate(name="laptop", expires_in_days=8)


@pytest.mark.parametrize("expires_in_days", [0, -1])
def test_create_schema_rejects_non_positive_lifetime(expires_in_days: int):
    with pytest.raises(ValidationError):
        ApiTokenCreate(name="laptop", expires_in_days=expires_in_days)


@pytest.mark.asyncio
async def test_api_token_follows_project_membership(
    unauthenticated_api_client, setup_db_auth
):
    created = await _create(unauthenticated_api_client)
    response = await unauthenticated_api_client.get(
        f"/projects/{setup_db_auth['project_id']}/samples",
        headers=_bearer(created["token"]),
    )
    assert response.status_code == 403
