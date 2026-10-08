"""Covers the httpOnly session cookie and the CSRF token that guards it.

The browser authenticates with a cookie it cannot read; scripted and server-to-server
callers keep using a bearer header. Both paths run through get_current_user.
"""

import pytest

from tests.api.auth.conftest import get_auth_token
from toktagger.api.auth import dependencies
from toktagger.api.auth.core import decode_token_with_age, get_internal_token
from toktagger.api.auth.cookies import CSRF_COOKIE_NAME
from toktagger.api.config import settings


async def login(client, username: str = "admin", password: str = "admin_pass"):
    """Log in and keep the cookies, unlike the header-oriented get_auth_token helper."""
    resp = await client.post(
        "/auth/token",
        data={"username": username, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert resp.status_code == 200, resp.text
    return resp


def set_cookie_header(resp, name: str) -> str:
    """The raw Set-Cookie line for `name` — parsed cookies drop the flags."""
    headers = [
        h for h in resp.headers.get_list("set-cookie") if h.startswith(f"{name}=")
    ]
    assert headers, f"no Set-Cookie for {name} in {resp.headers.get_list('set-cookie')}"
    return headers[0]


@pytest.mark.asyncio
async def test_login_sets_httponly_session_cookie(
    setup_db_auth, unauthenticated_api_client
):
    resp = await login(unauthenticated_api_client)

    header = set_cookie_header(resp, settings.auth.cookie_name)
    assert "HttpOnly" in header
    assert "Path=/" in header
    assert "SameSite=lax" in header
    assert "Max-Age=86400" in header


@pytest.mark.asyncio
async def test_login_sets_readable_csrf_cookie(
    setup_db_auth, unauthenticated_api_client
):
    """The CSRF cookie must NOT be httpOnly — the frontend has to echo it back."""
    resp = await login(unauthenticated_api_client)

    header = set_cookie_header(resp, CSRF_COOKIE_NAME)
    assert "HttpOnly" not in header
    assert resp.cookies[CSRF_COOKIE_NAME]


@pytest.mark.asyncio
async def test_cookie_authenticates_without_any_header(
    setup_db_auth, unauthenticated_api_client
):
    await login(unauthenticated_api_client)

    resp = await unauthenticated_api_client.get("/auth/me")

    assert resp.status_code == 200, resp.text
    assert resp.json()["username"] == "admin"


@pytest.mark.asyncio
async def test_login_over_http_does_not_mark_cookie_secure(
    setup_db_auth, unauthenticated_api_client
):
    """Secure is derived from the request scheme, so plain-HTTP dev logins still work."""
    resp = await login(unauthenticated_api_client)

    assert "Secure" not in set_cookie_header(resp, settings.auth.cookie_name)


@pytest.mark.asyncio
async def test_logout_clears_both_cookies(setup_db_auth, unauthenticated_api_client):
    await login(unauthenticated_api_client)
    csrf = unauthenticated_api_client.cookies[CSRF_COOKIE_NAME]

    resp = await unauthenticated_api_client.post(
        "/auth/logout", headers={"X-CSRF-Token": csrf}
    )

    assert resp.status_code == 204, resp.text
    for name in (settings.auth.cookie_name, CSRF_COOKIE_NAME):
        assert "Max-Age=0" in set_cookie_header(resp, name)
    assert (await unauthenticated_api_client.get("/auth/me")).status_code == 401


@pytest.mark.asyncio
async def test_logout_requires_authentication(
    setup_db_auth, unauthenticated_api_client
):
    assert (await unauthenticated_api_client.post("/auth/logout")).status_code == 401


@pytest.mark.asyncio
async def test_cookie_auth_rejects_unsafe_request_without_csrf_header(
    setup_db_auth,
    unauthenticated_api_client,
):
    await login(unauthenticated_api_client)

    resp = await unauthenticated_api_client.delete(
        f"/projects/{setup_db_auth['project_id']}"
    )

    assert resp.status_code == 403
    assert "CSRF" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_cookie_auth_rejects_mismatched_csrf_header(
    setup_db_auth, unauthenticated_api_client
):
    await login(unauthenticated_api_client)

    resp = await unauthenticated_api_client.delete(
        f"/projects/{setup_db_auth['project_id']}",
        headers={"X-CSRF-Token": "not-the-right-value"},
    )

    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_cookie_auth_accepts_matching_csrf_header(
    setup_db_auth, unauthenticated_api_client
):
    await login(unauthenticated_api_client)

    resp = await unauthenticated_api_client.delete(
        f"/projects/{setup_db_auth['project_id']}",
        headers={"X-CSRF-Token": unauthenticated_api_client.cookies[CSRF_COOKIE_NAME]},
    )

    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_cookie_auth_allows_safe_request_without_csrf_header(
    setup_db_auth, unauthenticated_api_client
):
    await login(unauthenticated_api_client)

    resp = await unauthenticated_api_client.get(
        f"/projects/{setup_db_auth['project_id']}/samples"
    )

    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_header_auth_skips_csrf(setup_db_auth, unauthenticated_api_client):
    """Bearer callers must never need a CSRF header.

    Ray workers call back in with a bearer token and no cookie jar (sender.py), as do
    scripts and most of this suite. A header cannot be attached by a cross-site caller,
    so it needs no CSRF cover — do not "tighten" this into requiring one for everybody.
    """
    token = await get_auth_token(unauthenticated_api_client, "admin", "admin_pass")

    resp = await unauthenticated_api_client.delete(
        f"/projects/{setup_db_auth['project_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_header_beats_ambient_cookie(setup_db_auth, unauthenticated_api_client):
    """An explicit bearer header wins over whatever session the client happens to hold."""
    alice_token = await get_auth_token(
        unauthenticated_api_client, "alice", "alice_pass"
    )
    await login(unauthenticated_api_client, "admin", "admin_pass")

    resp = await unauthenticated_api_client.get(
        "/auth/me", headers={"Authorization": f"Bearer {alice_token}"}
    )

    assert resp.json()["username"] == "alice"


@pytest.mark.asyncio
async def test_internal_token_still_accepted_with_cookie_present(
    setup_db_auth, unauthenticated_api_client
):
    """The server-to-server bypass must survive the cookie path being added."""
    await login(unauthenticated_api_client)

    resp = await unauthenticated_api_client.get(
        "/auth/me", headers={"Authorization": f"Bearer {get_internal_token()}"}
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["username"] == "__internal__"


def has_set_cookie(resp, name: str) -> bool:
    return any(h.startswith(f"{name}=") for h in resp.headers.get_list("set-cookie"))


@pytest.fixture
def renewal_due(monkeypatch):
    """Make every authenticated request look old enough to renew."""
    monkeypatch.setattr(dependencies, "ACCESS_TOKEN_RENEW_AFTER_SECONDS", 0)


@pytest.mark.asyncio
async def test_fresh_session_is_not_renewed(setup_db_auth, unauthenticated_api_client):
    """A session under half its life is left alone, so most responses set no cookie."""
    await login(unauthenticated_api_client)

    resp = await unauthenticated_api_client.get("/auth/me")

    assert not has_set_cookie(resp, settings.auth.cookie_name)


@pytest.mark.asyncio
async def test_stale_session_is_renewed_on_use(
    setup_db_auth, unauthenticated_api_client, renewal_due
):
    await login(unauthenticated_api_client)

    resp = await unauthenticated_api_client.get("/auth/me")

    assert resp.status_code == 200, resp.text
    assert "Max-Age=86400" in set_cookie_header(resp, settings.auth.cookie_name)
    # The token string is unchanged within the same second - itsdangerous timestamps
    # are whole seconds - so check the window itself slid rather than the bytes.
    _, age = decode_token_with_age(
        unauthenticated_api_client.cookies[settings.auth.cookie_name]
    )
    assert age < 5
    assert (await unauthenticated_api_client.get("/auth/me")).status_code == 200


@pytest.mark.asyncio
async def test_renewal_keeps_the_csrf_token_usable(
    setup_db_auth, unauthenticated_api_client, renewal_due
):
    """A renewal must not invalidate the CSRF value the page is already holding."""
    await login(unauthenticated_api_client)
    csrf = unauthenticated_api_client.cookies[CSRF_COOKIE_NAME]

    await unauthenticated_api_client.get("/auth/me")

    assert unauthenticated_api_client.cookies[CSRF_COOKIE_NAME] == csrf
    resp = await unauthenticated_api_client.delete(
        f"/projects/{setup_db_auth['project_id']}",
        headers={"X-CSRF-Token": csrf},
    )
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_bearer_caller_is_never_renewed(
    setup_db_auth, unauthenticated_api_client, renewal_due
):
    """Scripts and Ray callbacks hold their own token; handing them a cookie is wrong."""
    token = await get_auth_token(unauthenticated_api_client, "admin", "admin_pass")

    resp = await unauthenticated_api_client.get(
        "/auth/me", headers={"Authorization": f"Bearer {token}"}
    )

    assert resp.status_code == 200, resp.text
    assert not has_set_cookie(resp, settings.auth.cookie_name)


@pytest.mark.asyncio
async def test_logout_clears_cookies_when_a_renewal_is_due(
    setup_db_auth, unauthenticated_api_client, renewal_due
):
    """The dependency renews before the handler clears — the clear has to win."""
    await login(unauthenticated_api_client)

    resp = await unauthenticated_api_client.post(
        "/auth/logout",
        headers={"X-CSRF-Token": unauthenticated_api_client.cookies[CSRF_COOKIE_NAME]},
    )

    assert resp.status_code == 204, resp.text
    assert (await unauthenticated_api_client.get("/auth/me")).status_code == 401


@pytest.mark.asyncio
async def test_session_of_a_deleted_user_is_401(
    setup_db_auth, unauthenticated_api_client
):
    """401, not 404 — apiFetch only signs out on 401.

    On anything else the browser keeps a logged-in UI in which every request fails.
    """
    admin_token = await get_auth_token(
        unauthenticated_api_client, "admin", "admin_pass"
    )
    alice_token = await get_auth_token(
        unauthenticated_api_client, "alice", "alice_pass"
    )

    resp = await unauthenticated_api_client.delete(
        f"/users/{setup_db_auth['alice_id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200, resp.text

    resp = await unauthenticated_api_client.get(
        "/auth/me", headers={"Authorization": f"Bearer {alice_token}"}
    )
    assert resp.status_code == 401, resp.text


@pytest.mark.asyncio
async def test_session_of_a_deactivated_user_is_401(
    setup_db_auth, unauthenticated_api_client
):
    """Same reasoning as a deleted user: the credential no longer authenticates."""
    admin_token = await get_auth_token(
        unauthenticated_api_client, "admin", "admin_pass"
    )
    alice_token = await get_auth_token(
        unauthenticated_api_client, "alice", "alice_pass"
    )

    resp = await unauthenticated_api_client.put(
        f"/users/{setup_db_auth['alice_id']}",
        json={"is_active": False},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200, resp.text

    resp = await unauthenticated_api_client.get(
        "/auth/me", headers={"Authorization": f"Bearer {alice_token}"}
    )
    assert resp.status_code == 401, resp.text
