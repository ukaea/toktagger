"""Covers the httpOnly session cookie and the CSRF token that guards it.

The browser authenticates with a cookie it cannot read; scripted and server-to-server
callers keep using a bearer header. Both paths run through get_current_user.
"""

import asyncio
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from tests.api.auth.conftest import END_SESSION_URL, ISSUER, sign_in
from tests.db_definitions import USER_ADMIN_ID, USER_ALICE, USER_ALICE_ID
from tests.identity import get_auth_token, session_headers
from toktagger.api import config
from toktagger.api.auth import oidc, sessions
from toktagger.api.auth.core import (
    decode_token_with_age,
    decrypt_secret,
    get_internal_token,
)
from toktagger.api.auth.cookies import CSRF_COOKIE_NAME
from toktagger.api.crud import utils

SESSION_IDLE_TIMEOUT = 24 * 60 * 60


@pytest.fixture(autouse=True)
def _identity_provider(idp):
    """Every test here signs in through the OIDC callback, so a provider must be registered."""


async def login(client, username: str = "admin", groups: list[str] | None = None):
    """Sign in through the OIDC callback and keep the cookies, unlike get_auth_token."""
    claims = {
        "sub": f"{username}-sub",
        "preferred_username": username,
        "groups": groups or [],
    }
    idp = client.app.state.idp.client
    idp.fake_token = {
        "refresh_token": "refresh-1",
        "id_token": "id-1",
        "userinfo": claims,
    }
    idp.fake_userinfo = dict(claims)
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

    header = set_cookie_header(resp, config.settings.auth.cookie_name)
    assert "HttpOnly" in header
    assert "Path=/" in header
    assert "SameSite=lax" in header
    assert f"Max-Age={SESSION_IDLE_TIMEOUT}" in header


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

    assert "Secure" not in set_cookie_header(resp, config.settings.auth.cookie_name)


@pytest.mark.asyncio
async def test_logout_clears_both_cookies(setup_db_auth, unauthenticated_api_client):
    await login(unauthenticated_api_client)
    csrf = unauthenticated_api_client.cookies[CSRF_COOKIE_NAME]

    resp = await unauthenticated_api_client.post(
        "/auth/logout", headers={"X-CSRF-Token": csrf}
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["logout_url"].startswith(END_SESSION_URL)
    for name in (config.settings.auth.cookie_name, CSRF_COOKIE_NAME):
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
async def test_header_auth_skips_csrf(model_status_url, unauthenticated_api_client):
    """Bearer callers must never need a CSRF header.

    Ray workers call back in with a bearer token and no cookie jar (sender.py), as do
    scripts and most of this suite. A header cannot be attached by a cross-site caller,
    so it needs no CSRF cover — do not "tighten" this into requiring one for everybody.
    """
    resp = await unauthenticated_api_client.put(
        model_status_url,
        json={"progress": 50},
        headers={"Authorization": f"Bearer {get_internal_token()}"},
    )

    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_internal_token_still_accepted_with_cookie_present(
    model_status_url, unauthenticated_api_client
):
    """The server-to-server bypass must survive the cookie path being added."""
    await login(unauthenticated_api_client, username="outsider")

    resp = await unauthenticated_api_client.put(
        model_status_url,
        json={"progress": 50},
        headers={"Authorization": f"Bearer {get_internal_token()}"},
    )

    assert resp.status_code == 200, resp.text


def has_set_cookie(resp, name: str) -> bool:
    return any(h.startswith(f"{name}=") for h in resp.headers.get_list("set-cookie"))


@pytest.fixture
def refresh_due(monkeypatch):
    """Make every authenticated request old enough to refresh at the provider."""
    monkeypatch.setattr(config.settings.auth, "session_refresh_seconds", 0)


async def delete_project(client, project_id: str, csrf: str):
    return await client.delete(
        f"/projects/{project_id}", headers={"X-CSRF-Token": csrf}
    )


@pytest.mark.asyncio
async def test_sign_in_stores_the_provider_tokens_in_a_session(
    setup_db_auth, unauthenticated_api_client, db_client
):
    await login(unauthenticated_api_client)

    payload, _ = decode_token_with_age(
        unauthenticated_api_client.cookies[config.settings.auth.cookie_name]
    )
    session = await db_client.db["sessions"].find_one({"_id": payload["sid"]})
    assert session["user_id"] == setup_db_auth["admin_id"]
    assert payload["sub"] == setup_db_auth["admin_id"]
    assert session["refresh_token"] != "refresh-1"
    assert decrypt_secret(session["refresh_token"]) == "refresh-1"
    assert session["id_token"] != "id-1"
    assert decrypt_secret(session["id_token"]) == "id-1"


@pytest.mark.asyncio
async def test_sign_in_without_a_refresh_token_fails(
    setup_db_auth, unauthenticated_api_client, idp
):
    """Without a refresh token, the session could never read the account again."""
    idp.fake_token = {"userinfo": {"sub": "admin-sub"}}

    resp = await sign_in(unauthenticated_api_client)

    assert resp.headers["location"] == "/ui/login?error=login_failed"


@pytest.mark.asyncio
async def test_fresh_session_is_not_refreshed(
    setup_db_auth, unauthenticated_api_client, idp
):
    await login(unauthenticated_api_client)

    resp = await unauthenticated_api_client.get("/auth/me")

    assert not has_set_cookie(resp, config.settings.auth.cookie_name)
    assert idp.refresh_calls == []


@pytest.mark.asyncio
async def test_stale_session_is_refreshed_at_the_provider(
    setup_db_auth, unauthenticated_api_client, refresh_due, idp
):
    await login(unauthenticated_api_client)

    resp = await unauthenticated_api_client.get("/auth/me")

    assert resp.status_code == 200, resp.text
    assert idp.refresh_calls == ["refresh-1"]
    assert f"Max-Age={SESSION_IDLE_TIMEOUT}" in set_cookie_header(
        resp, config.settings.auth.cookie_name
    )
    _, age = decode_token_with_age(
        unauthenticated_api_client.cookies[config.settings.auth.cookie_name]
    )
    assert age < 5


@pytest.mark.asyncio
async def test_refresh_uses_the_rotated_refresh_token(
    setup_db_auth, unauthenticated_api_client, refresh_due, idp
):
    await login(unauthenticated_api_client)

    await unauthenticated_api_client.get("/auth/me")
    await unauthenticated_api_client.get("/auth/me")

    assert idp.refresh_calls == ["refresh-1", "refresh-2"]


@pytest.mark.asyncio
async def test_refresh_applies_a_demotion_at_the_provider(
    setup_db_auth, unauthenticated_api_client, db_client, refresh_due, idp
):
    await login(unauthenticated_api_client, groups=["toktagger-admins"])
    assert (await utils.get_user_by_username(db_client, "admin")).global_role == "admin"
    idp.fake_userinfo["groups"] = []

    resp = await unauthenticated_api_client.get("/auth/me")

    assert resp.status_code == 200, resp.text
    assert resp.json()["global_role"] == "user"


@pytest.mark.asyncio
async def test_refusal_at_the_provider_ends_the_session(
    setup_db_auth, unauthenticated_api_client, refresh_due, idp
):
    await login(unauthenticated_api_client)
    idp.fake_refresh = oidc.OAuthError(error="invalid_grant")

    assert (await unauthenticated_api_client.get("/auth/me")).status_code == 401
    idp.fake_refresh = {"refresh_token": "refresh-2"}
    assert (await unauthenticated_api_client.get("/auth/me")).status_code == 401


@pytest.mark.asyncio
async def test_undecryptable_refresh_token_ends_the_session(
    setup_db_auth, unauthenticated_api_client, db_client, refresh_due, idp
):
    """A changed signing secret leaves stored refresh tokens unreadable."""
    await login(unauthenticated_api_client)
    await db_client.db["sessions"].update_many(
        {}, {"$set": {"refresh_token": "refresh-1"}}
    )

    assert (await unauthenticated_api_client.get("/auth/me")).status_code == 401
    assert idp.refresh_calls == []


@pytest.mark.asyncio
async def test_refresh_for_a_different_account_ends_the_session(
    setup_db_auth, unauthenticated_api_client, refresh_due, idp
):
    await login(unauthenticated_api_client)
    idp.fake_userinfo = {"sub": "someone-else", "preferred_username": "x"}

    assert (await unauthenticated_api_client.get("/auth/me")).status_code == 401


@pytest.mark.asyncio
async def test_unreachable_provider_is_503_and_keeps_the_session(
    setup_db_auth, unauthenticated_api_client, refresh_due, idp
):
    """Fail closed, but do not sign the user out for a provider outage."""
    await login(unauthenticated_api_client)
    idp.fake_refresh = httpx.ConnectError("provider down")

    assert (await unauthenticated_api_client.get("/auth/me")).status_code == 503
    idp.fake_refresh = {"refresh_token": "refresh-2"}
    assert (await unauthenticated_api_client.get("/auth/me")).status_code == 200


@pytest.mark.asyncio
async def test_concurrent_refreshes_use_the_refresh_token_once(
    setup_db_auth, db_client, idp, registered_idp
):
    """The provider revokes a used refresh token, so a second use would end the session."""
    session_id = await sessions.start_session(
        db_client, USER_ADMIN_ID, ISSUER, "admin-sub", {"refresh_token": "refresh-1"}
    )
    await db_client.db["sessions"].update_one(
        {"_id": session_id}, {"$set": {"refreshed_at": 0}}
    )
    idp.fake_userinfo = {"sub": "admin-sub", "preferred_username": "admin"}

    await asyncio.gather(
        sessions.refresh_session(db_client, registered_idp, session_id),
        sessions.refresh_session(db_client, registered_idp, session_id),
    )

    assert idp.refresh_calls == ["refresh-1"]


@pytest.mark.asyncio
async def test_refresh_keeps_the_csrf_token_usable(
    setup_db_auth, unauthenticated_api_client, refresh_due
):
    """A refresh must not invalidate the CSRF value the page is already holding."""
    await login(unauthenticated_api_client)
    csrf = unauthenticated_api_client.cookies[CSRF_COOKIE_NAME]

    await unauthenticated_api_client.get("/auth/me")

    assert unauthenticated_api_client.cookies[CSRF_COOKIE_NAME] == csrf
    resp = await delete_project(
        unauthenticated_api_client, setup_db_auth["project_id"], csrf
    )
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_bearer_caller_is_never_refreshed(
    model_status_url, unauthenticated_api_client, refresh_due, idp
):
    """Scripts and Ray callbacks hold their own token; handing them a cookie is wrong."""
    resp = await unauthenticated_api_client.put(
        model_status_url,
        json={"progress": 50},
        headers={"Authorization": f"Bearer {get_internal_token()}"},
    )

    assert resp.status_code == 200, resp.text
    assert not has_set_cookie(resp, config.settings.auth.cookie_name)
    assert idp.refresh_calls == []


@pytest.mark.asyncio
async def test_logout_clears_cookies_when_a_refresh_is_due(
    setup_db_auth, unauthenticated_api_client, refresh_due
):
    """The dependency refreshes before the handler clears — the clear has to win."""
    await login(unauthenticated_api_client)

    resp = await unauthenticated_api_client.post(
        "/auth/logout",
        headers={"X-CSRF-Token": unauthenticated_api_client.cookies[CSRF_COOKIE_NAME]},
    )

    assert resp.status_code == 200, resp.text
    assert (await unauthenticated_api_client.get("/auth/me")).status_code == 401


@pytest.mark.asyncio
async def test_logout_ends_the_session_and_sends_the_id_token_hint(
    setup_db_auth, unauthenticated_api_client, refresh_due
):
    await login(unauthenticated_api_client)
    cookie = unauthenticated_api_client.cookies[config.settings.auth.cookie_name]

    resp = await unauthenticated_api_client.post(
        "/auth/logout",
        headers={"X-CSRF-Token": unauthenticated_api_client.cookies[CSRF_COOKIE_NAME]},
    )

    query = parse_qs(urlparse(resp.json()["logout_url"]).query)
    assert query["id_token_hint"] == ["id-1"]
    unauthenticated_api_client.cookies.set(config.settings.auth.cookie_name, cookie)
    assert (await unauthenticated_api_client.get("/auth/me")).status_code == 401


@pytest.mark.asyncio
async def test_session_of_a_deleted_user_is_401(
    setup_db_auth, unauthenticated_api_client
):
    """401, not 404 — apiFetch only signs out on 401.

    On anything else the browser keeps a logged-in UI in which every request fails.
    """
    admin_token = get_auth_token(USER_ADMIN_ID)
    alice_token = get_auth_token(USER_ALICE_ID)

    resp = await unauthenticated_api_client.delete(
        f"/users/{setup_db_auth['alice_id']}",
        headers=session_headers(admin_token),
    )
    assert resp.status_code == 200, resp.text

    resp = await unauthenticated_api_client.get(
        "/auth/me", headers=session_headers(alice_token)
    )
    assert resp.status_code == 401, resp.text


@pytest.mark.asyncio
async def test_session_does_not_pass_to_a_new_user_with_the_same_username(
    setup_db_auth, unauthenticated_api_client, db_client
):
    admin_token = get_auth_token(USER_ADMIN_ID)
    alice_token = get_auth_token(USER_ALICE_ID)
    resp = await unauthenticated_api_client.delete(
        f"/users/{setup_db_auth['alice_id']}",
        headers=session_headers(admin_token),
    )
    assert resp.status_code == 200, resp.text
    await db_client.insert(
        "users", USER_ALICE.model_copy(update={"oidc_sub": "new-alice-sub"})
    )

    resp = await unauthenticated_api_client.get(
        "/auth/me", headers=session_headers(alice_token)
    )
    assert resp.status_code == 401, resp.text


@pytest.mark.asyncio
async def test_session_of_a_deactivated_user_is_401(
    setup_db_auth, unauthenticated_api_client
):
    """Same reasoning as a deleted user: the credential no longer authenticates."""
    admin_token = get_auth_token(USER_ADMIN_ID)
    alice_token = get_auth_token(USER_ALICE_ID)

    resp = await unauthenticated_api_client.put(
        f"/users/{setup_db_auth['alice_id']}",
        json={"is_active": False},
        headers=session_headers(admin_token),
    )
    assert resp.status_code == 200, resp.text

    resp = await unauthenticated_api_client.get(
        "/auth/me", headers=session_headers(alice_token)
    )
    assert resp.status_code == 401, resp.text


@pytest.mark.asyncio
async def test_session_token_is_not_accepted_as_a_bearer(
    setup_db_auth, unauthenticated_api_client
):
    """As a bearer, a session token would skip the CSRF check and the provider refresh."""
    resp = await unauthenticated_api_client.get(
        "/auth/me", headers={"Authorization": f"Bearer {get_auth_token(USER_ADMIN_ID)}"}
    )

    assert resp.status_code == 401
