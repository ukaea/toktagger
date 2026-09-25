"""Conftest for auth tests — uses mongita (no Docker required)."""

from httpx import AsyncClient


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
