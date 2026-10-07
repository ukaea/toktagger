"""Covers the httpOnly session cookie and the CSRF token that guards it.

The browser authenticates with a cookie it cannot read; scripted and server-to-server
callers keep using a bearer header. Both paths run through get_current_user.
"""

import time

import pytest
from fastapi import Response
from starlette.requests import Request

from tests.api.auth.conftest import END_SESSION_URL, get_auth_token, sign_in
from toktagger.api.auth import dependencies, oidc
from toktagger.api.auth.core import (
    create_access_token,
    decode_token,
    decode_token_with_age,
    get_internal_token,
)
from toktagger.api.auth.cookies import (
    CSRF_COOKIE_NAME,
    ID_TOKEN_COOKIE_NAME,
    MAX_ID_TOKEN_COOKIE_BYTES,
    set_session_cookies,
)
from toktagger.api.config import settings

SESSION_MAX_AGE = 12 * 60 * 60


@pytest.fixture(autouse=True)
def _identity_provider(idp):
    """Every test here signs in through the OIDC callback, so a provider must be registered."""


async def login(client, username: str = "admin"):
    """Sign in through the OIDC callback and keep the cookies, unlike get_auth_token."""
    oidc.get_idp().fake_token = {
        "userinfo": {"sub": f"{username}-sub", "preferred_username": username}
    }
    resp = await sign_in(client)
    assert resp.status_code == 303, resp.text
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
    assert f"Max-Age={SESSION_MAX_AGE}" in header


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

    assert resp.status_code == 200, resp.text
    assert resp.json()["logout_url"].startswith(END_SESSION_URL)
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
    token = get_auth_token("admin")

    resp = await unauthenticated_api_client.delete(
        f"/projects/{setup_db_auth['project_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_header_beats_ambient_cookie(setup_db_auth, unauthenticated_api_client):
    """An explicit bearer header wins over whatever session the client happens to hold."""
    alice_token = get_auth_token("alice")
    await login(unauthenticated_api_client, "admin")

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
    assert f"Max-Age={SESSION_MAX_AGE}" in set_cookie_header(
        resp, settings.auth.cookie_name
    )
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
    token = get_auth_token("admin")

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

    assert resp.status_code == 200, resp.text
    assert (await unauthenticated_api_client.get("/auth/me")).status_code == 401


@pytest.mark.asyncio
async def test_session_of_a_deleted_user_is_401(
    setup_db_auth, unauthenticated_api_client
):
    """401, not 404 — apiFetch only signs out on 401.

    On anything else the browser keeps a logged-in UI in which every request fails.
    """
    admin_token = get_auth_token("admin")
    alice_token = get_auth_token("alice")

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
    admin_token = get_auth_token("admin")
    alice_token = get_auth_token("alice")

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


def session_cookie(client, auth_time: int | None) -> None:
    """Put a session cookie with the given sign-in time in the client jar."""
    payload: dict = {"sub": "admin", "csrf": "csrf-value"}
    if auth_time is not None:
        payload["auth_time"] = auth_time
    client.cookies.set(settings.auth.cookie_name, create_access_token(payload))


@pytest.mark.asyncio
async def test_sign_in_records_the_sign_in_time(
    setup_db_auth, unauthenticated_api_client
):
    before = int(time.time())

    await login(unauthenticated_api_client)

    payload = decode_token(
        unauthenticated_api_client.cookies[settings.auth.cookie_name]
    )
    assert before <= payload["auth_time"] <= int(time.time())


@pytest.mark.asyncio
async def test_session_cookie_without_a_sign_in_time_is_401(
    setup_db_auth, unauthenticated_api_client
):
    session_cookie(unauthenticated_api_client, None)

    resp = await unauthenticated_api_client.get("/auth/me")

    assert resp.status_code == 401
    assert "Session expired" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_fresh_cookie_past_the_maximum_session_age_is_401(
    setup_db_auth, unauthenticated_api_client
):
    session_cookie(unauthenticated_api_client, int(time.time()) - SESSION_MAX_AGE - 1)

    resp = await unauthenticated_api_client.get("/auth/me")

    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_bearer_session_token_has_no_maximum_session_age(
    setup_db_auth, unauthenticated_api_client
):
    """Scripts hold a non-sliding token that expires on its own, so the cap is not applied."""
    resp = await unauthenticated_api_client.get(
        "/auth/me", headers={"Authorization": f"Bearer {get_auth_token('admin')}"}
    )

    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_renewal_keeps_the_sign_in_time_and_the_remaining_age(
    setup_db_auth, unauthenticated_api_client, renewal_due
):
    auth_time = int(time.time()) - SESSION_MAX_AGE + 600
    session_cookie(unauthenticated_api_client, auth_time)
    unauthenticated_api_client.cookies.set(ID_TOKEN_COOKIE_NAME, "id-token")

    resp = await unauthenticated_api_client.get("/auth/me")

    assert resp.status_code == 200, resp.text
    header = set_cookie_header(resp, settings.auth.cookie_name)
    max_age = int(header.split("Max-Age=")[1].split(";")[0])
    assert 590 <= max_age <= 600
    payload = decode_token(header.split(";")[0].split("=", 1)[1])
    assert payload["auth_time"] == auth_time
    assert "Max-Age=" in set_cookie_header(resp, ID_TOKEN_COOKIE_NAME)


def test_oversized_id_token_is_not_stored_in_a_cookie(caplog):
    request = Request({"type": "http", "scheme": "http", "path": "/", "headers": []})
    response = Response()

    set_session_cookies(
        request,
        response,
        "session",
        "csrf",
        int(time.time()),
        "x" * (MAX_ID_TOKEN_COOKIE_BYTES + 1),
    )

    cookie_names = {
        header.split("=")[0] for header in response.headers.getlist("set-cookie")
    }
    assert cookie_names == {settings.auth.cookie_name, CSRF_COOKIE_NAME}
    assert "too large for a cookie" in caplog.text
