"""Integration tests for the /auth/me endpoint and the removed password login."""

import pytest

from tests.api.auth.conftest import get_auth_token


@pytest.mark.asyncio
async def test_password_login_endpoint_is_gone(
    unauthenticated_api_client, setup_db_auth
):
    response = await unauthenticated_api_client.post(
        "/auth/token",
        data={"username": "admin", "password": "admin_pass"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert not response.is_success
    assert "access_token" not in response.text


@pytest.mark.asyncio
async def test_inactive_user_session_is_rejected(
    unauthenticated_api_client, setup_db_auth
):
    """Deactivated users lose access even with a valid token."""
    client = unauthenticated_api_client
    admin_token = get_auth_token("admin")
    alice_token = get_auth_token("alice")

    await client.put(
        f"/users/{setup_db_auth['alice_id']}",
        json={"is_active": False},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    response = await client.get(
        "/auth/me", headers={"Authorization": f"Bearer {alice_token}"}
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me_returns_current_user(unauthenticated_api_client, setup_db_auth):
    client = unauthenticated_api_client
    token = get_auth_token("alice")
    response = await client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {token}"},
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
    token = get_auth_token("admin")
    response = await client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {token}"},
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
