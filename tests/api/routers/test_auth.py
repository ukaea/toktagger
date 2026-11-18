"""Integration tests for the /auth/me endpoint."""

import pytest

from tests.db_definitions import USER_ADMIN_ID, USER_ALICE_ID
from tests.identity import get_auth_token, session_headers


@pytest.mark.asyncio
async def test_inactive_user_session_is_rejected(
    unauthenticated_api_client, setup_db_auth
):
    """Deactivated users lose access even with a valid token."""
    client = unauthenticated_api_client
    admin_token = get_auth_token(USER_ADMIN_ID)
    alice_token = get_auth_token(USER_ALICE_ID)

    await client.put(
        f"/users/{setup_db_auth['alice_id']}",
        json={"is_active": False},
        headers=session_headers(admin_token),
    )

    response = await client.get("/auth/me", headers=session_headers(alice_token))
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me_returns_current_user(unauthenticated_api_client, setup_db_auth):
    client = unauthenticated_api_client
    token = get_auth_token(USER_ALICE_ID)
    response = await client.get(
        "/auth/me",
        headers=session_headers(token),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["username"] == "alice"
    assert body["global_role"] == "user"
    assert body["is_active"] is True
    assert "hashed_password" not in body
    assert "oidc_sub" not in body


@pytest.mark.asyncio
async def test_get_me_admin_role(unauthenticated_api_client, setup_db_auth):
    client = unauthenticated_api_client
    token = get_auth_token(USER_ADMIN_ID)
    response = await client.get(
        "/auth/me",
        headers=session_headers(token),
    )
    assert response.status_code == 200
    assert response.json()["global_role"] == "admin"


@pytest.mark.asyncio
async def test_get_me_no_token(unauthenticated_api_client, setup_db_auth):
    client = unauthenticated_api_client
    response = await client.get("/auth/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me_invalid_token(unauthenticated_api_client, setup_db_auth):
    client = unauthenticated_api_client
    response = await client.get(
        "/auth/me",
        headers={"Authorization": "Bearer not.a.real.token"},
    )
    assert response.status_code == 401
