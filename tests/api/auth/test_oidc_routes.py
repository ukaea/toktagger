import time
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from authlib.integrations.base_client.errors import OAuthError
from joserfc.jwk import RSAKey

from tests.api.auth.conftest import (
    AUTHORIZE_URL,
    END_SESSION_URL,
    ISSUER,
    PUBLIC_URL,
    mint_token,
    sign_in,
)
from toktagger.api import config
from toktagger.api.auth import oidc
from toktagger.api.auth.core import create_access_token, get_internal_token
from toktagger.api.auth.cookies import CSRF_COOKIE_NAME


@pytest.mark.asyncio
async def test_login_redirects_to_the_provider_with_pkce(
    unauthenticated_api_client, idp
):
    resp = await unauthenticated_api_client.get(
        "/auth/login", params={"return_to": "/ui/projects"}
    )

    assert resp.status_code == 302
    location = urlparse(resp.headers["location"])
    query = parse_qs(location.query)
    assert f"{location.scheme}://{location.netloc}{location.path}" == AUTHORIZE_URL
    assert query["client_id"] == ["toktagger"]
    assert query["redirect_uri"] == [f"{PUBLIC_URL}/auth/callback"]
    assert query["code_challenge_method"] == ["S256"]
    assert query["scope"] == ["openid profile email"]
    assert "state" in query
    assert "tt_oidc_flow" in resp.headers["set-cookie"]


@pytest.mark.asyncio
async def test_login_uses_the_configured_public_url_for_the_redirect_uri(
    unauthenticated_api_client, idp, oidc_settings, monkeypatch
):
    monkeypatch.setattr(oidc_settings, "public_url", "https://toktagger.example.com/")

    resp = await unauthenticated_api_client.get("/auth/login")

    redirect_uri = parse_qs(urlparse(resp.headers["location"]).query)["redirect_uri"]
    assert redirect_uri == ["https://toktagger.example.com/auth/callback"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "return_to",
    [
        "https://evil.example/ui/",
        "//evil.example/ui/",
        "/projects",
        "/ui",
        "ui/projects",
        "javascript:alert(1)",
        "/ui/\\evil.example",
        "",
    ],
)
async def test_login_rejects_return_to_outside_the_ui(
    unauthenticated_api_client, idp, return_to
):
    resp = await unauthenticated_api_client.get(
        "/auth/login", params={"return_to": return_to}
    )

    assert resp.status_code == 400
    assert "location" not in resp.headers


@pytest.mark.asyncio
async def test_login_reports_an_unreachable_provider(
    unauthenticated_api_client, idp, monkeypatch
):
    async def unreachable(request, redirect_uri):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(idp, "authorize_redirect", unreachable)

    resp = await unauthenticated_api_client.get("/auth/login")

    assert resp.status_code == 303
    assert resp.headers["location"] == "/ui/login?error=idp_unavailable"


@pytest.mark.asyncio
async def test_callback_provisions_the_user_and_starts_a_session(
    unauthenticated_api_client, idp
):
    resp = await sign_in(unauthenticated_api_client, "/ui/projects/7")

    assert resp.status_code == 303
    assert resp.headers["location"] == "/ui/projects/7"
    assert unauthenticated_api_client.cookies[config.settings.auth.cookie_name]
    assert unauthenticated_api_client.cookies[CSRF_COOKIE_NAME]
    me = await unauthenticated_api_client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["username"] == "alice"
    assert me.json()["email"] == "alice@example.com"
    assert me.json()["global_role"] == "user"


@pytest.mark.asyncio
async def test_callback_defaults_return_to_the_projects_page(
    unauthenticated_api_client, idp
):
    resp = await sign_in(unauthenticated_api_client, return_to=None)

    assert resp.headers["location"] == "/ui/projects"


@pytest.mark.asyncio
async def test_callback_session_works_for_unsafe_methods_with_the_csrf_header(
    unauthenticated_api_client, idp
):
    await sign_in(unauthenticated_api_client)
    csrf = unauthenticated_api_client.cookies[CSRF_COOKIE_NAME]

    without_header = await unauthenticated_api_client.post("/auth/logout")
    with_header = await unauthenticated_api_client.post(
        "/auth/logout", headers={"X-CSRF-Token": csrf}
    )

    assert without_header.status_code == 403
    assert with_header.status_code == 200


@pytest.mark.asyncio
async def test_callback_gives_admin_role_from_the_groups_claim(
    unauthenticated_api_client, idp
):
    idp.fake_token["userinfo"]["groups"] = ["toktagger-admins"]

    await sign_in(unauthenticated_api_client)

    me = await unauthenticated_api_client.get("/auth/me")
    assert me.json()["global_role"] == "admin"


@pytest.mark.asyncio
async def test_callback_removes_admin_role_when_the_group_is_gone(
    unauthenticated_api_client, idp
):
    idp.fake_token["userinfo"]["groups"] = ["toktagger-admins"]
    await sign_in(unauthenticated_api_client)
    idp.fake_token["userinfo"]["groups"] = []

    await sign_in(unauthenticated_api_client)

    me = await unauthenticated_api_client.get("/auth/me")
    assert me.json()["global_role"] == "user"


@pytest.mark.asyncio
async def test_callback_reads_roles_from_userinfo_when_the_id_token_has_none(
    unauthenticated_api_client, idp
):
    del idp.fake_token["userinfo"]["groups"]
    idp.fake_userinfo = {"sub": "sub-1", "groups": ["toktagger-admins"]}

    await sign_in(unauthenticated_api_client)

    me = await unauthenticated_api_client.get("/auth/me")
    assert me.json()["global_role"] == "admin"


@pytest.mark.asyncio
async def test_callback_ignores_userinfo_for_a_different_subject(
    unauthenticated_api_client, idp
):
    del idp.fake_token["userinfo"]["groups"]
    idp.fake_userinfo = {"sub": "someone-else", "groups": ["toktagger-admins"]}

    await sign_in(unauthenticated_api_client)

    me = await unauthenticated_api_client.get("/auth/me")
    assert me.json()["global_role"] == "user"


@pytest.mark.asyncio
async def test_callback_refuses_an_inactive_user(
    unauthenticated_api_client, idp, db_client
):
    await sign_in(unauthenticated_api_client)
    unauthenticated_api_client.cookies.clear()
    await db_client.db["users"].update_one(
        {"username": "alice"}, {"$set": {"is_active": False}}
    )

    resp = await sign_in(unauthenticated_api_client)

    assert resp.status_code == 303
    assert resp.headers["location"] == "/ui/login?error=inactive"
    assert config.settings.auth.cookie_name not in unauthenticated_api_client.cookies


@pytest.mark.asyncio
async def test_callback_reports_provider_errors_by_code_only(
    unauthenticated_api_client, idp
):
    idp.fake_token = OAuthError(error="access_denied", description="<script>x</script>")

    resp = await sign_in(unauthenticated_api_client)

    assert resp.headers["location"] == "/ui/login?error=access_denied"
    assert config.settings.auth.cookie_name not in unauthenticated_api_client.cookies


@pytest.mark.asyncio
async def test_callback_hides_unexpected_error_codes(unauthenticated_api_client, idp):
    idp.fake_token = OAuthError(error="<script>alert(1)</script>")

    resp = await sign_in(unauthenticated_api_client)

    assert resp.headers["location"] == "/ui/login?error=login_failed"


@pytest.mark.asyncio
async def test_callback_reports_an_unreachable_provider(
    unauthenticated_api_client, idp
):
    idp.fake_token = httpx.ConnectError("down")

    resp = await sign_in(unauthenticated_api_client)

    assert resp.headers["location"] == "/ui/login?error=idp_unavailable"


@pytest.mark.asyncio
async def test_callback_without_a_subject_fails_the_sign_in(
    unauthenticated_api_client, idp
):
    del idp.fake_token["userinfo"]["sub"]

    resp = await sign_in(unauthenticated_api_client)

    assert resp.headers["location"] == "/ui/login?error=login_failed"
    assert config.settings.auth.cookie_name not in unauthenticated_api_client.cookies


@pytest.mark.asyncio
async def test_callback_without_a_started_flow_still_requires_a_valid_token(
    unauthenticated_api_client, idp
):
    idp.fake_token = OAuthError(error="mismatching_state")

    resp = await unauthenticated_api_client.get(
        "/auth/callback", params={"code": "c", "state": "s"}
    )

    assert resp.headers["location"] == "/ui/login?error=mismatching_state"


@pytest.mark.asyncio
async def test_config_for_the_managed_provider_links_to_canaille(
    unauthenticated_api_client, monkeypatch
):
    monkeypatch.setattr(config.settings, "auth", config.Auth(provider="canaille"))

    resp = await unauthenticated_api_client.get("/auth/config")

    assert resp.status_code == 200
    assert resp.json() == {
        "provider": "canaille",
        "account_url": "http://localhost:8003/",
    }


@pytest.mark.asyncio
async def test_config_for_keycloak_links_to_the_account_console(
    unauthenticated_api_client, oidc_settings
):
    resp = await unauthenticated_api_client.get("/auth/config")

    assert resp.json() == {"provider": "oidc", "account_url": f"{ISSUER}/account"}


@pytest.mark.asyncio
async def test_config_account_link_uses_the_public_issuer_from_discovery(
    unauthenticated_api_client, oidc_settings, monkeypatch
):
    """The configured issuer URL may be a container-internal name the browser cannot reach."""
    monkeypatch.setattr(oidc_settings, "issuer_url", "http://keycloak:8080/realms/tt")

    async def get_metadata():
        return {"issuer": "http://localhost:8080/realms/tt"}

    monkeypatch.setattr(oidc, "get_metadata", get_metadata)

    resp = await unauthenticated_api_client.get("/auth/config")

    assert resp.json()["account_url"] == "http://localhost:8080/realms/tt/account"


@pytest.mark.asyncio
async def test_config_account_link_falls_back_to_the_configured_issuer(
    unauthenticated_api_client, oidc_settings, monkeypatch
):
    async def unreachable():
        raise httpx.ConnectError("down")

    monkeypatch.setattr(oidc, "get_metadata", unreachable)

    resp = await unauthenticated_api_client.get("/auth/config")

    assert resp.json()["account_url"] == f"{ISSUER}/account"


@pytest.mark.asyncio
async def test_config_for_another_provider_has_no_account_link(
    unauthenticated_api_client, monkeypatch
):
    auth = config.Auth(
        provider="oidc", issuer_url="https://sso.example.com", client_secret="s"
    )
    monkeypatch.setattr(config.settings, "auth", auth)

    resp = await unauthenticated_api_client.get("/auth/config")

    assert resp.json() == {"provider": "oidc", "account_url": None}


@pytest.mark.asyncio
async def test_logout_returns_the_provider_sign_out_url(api_client, idp):
    resp = await api_client.post("/auth/logout")

    assert resp.status_code == 200
    logout_url = urlparse(resp.json()["logout_url"])
    assert (
        f"{logout_url.scheme}://{logout_url.netloc}{logout_url.path}" == END_SESSION_URL
    )
    query = parse_qs(logout_url.query)
    assert query["client_id"] == ["toktagger"]
    assert query["post_logout_redirect_uri"] == [f"{PUBLIC_URL}/ui/login"]


@pytest.mark.asyncio
async def test_logout_has_no_url_when_the_provider_cannot_end_sessions(api_client, idp):
    del idp.server_metadata["end_session_endpoint"]

    resp = await api_client.post("/auth/logout")

    assert resp.json() == {"logout_url": None}


@pytest.mark.asyncio
async def test_logout_succeeds_when_the_provider_is_unreachable(
    api_client, idp, monkeypatch
):
    async def unreachable():
        raise httpx.ConnectError("down")

    monkeypatch.setattr(oidc, "get_metadata", unreachable)

    resp = await api_client.post("/auth/logout")

    assert resp.status_code == 200
    assert resp.json() == {"logout_url": None}


@pytest.mark.asyncio
async def test_bearer_idp_token_is_accepted_and_provisions_the_user(
    unauthenticated_api_client, oidc_settings, jwks_route, idp_key
):
    token = mint_token(
        idp_key, sub="script-1", preferred_username="robot", groups=["toktagger-admins"]
    )

    resp = await unauthenticated_api_client.get(
        "/auth/me", headers={"Authorization": f"Bearer {token}"}
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["username"] == "robot"
    assert resp.json()["global_role"] == "admin"


@pytest.mark.asyncio
async def test_bearer_idp_token_does_not_change_the_role_or_profile(
    unauthenticated_api_client, oidc_settings, jwks_route, idp_key, db_client
):
    await oidc.provision_user(
        db_client,
        ISSUER,
        {
            "sub": "user-1",
            "preferred_username": "carol",
            "groups": ["toktagger-admins"],
            "email": "carol@example.com",
            "name": "Carol",
        },
    )

    resp = await unauthenticated_api_client.get(
        "/auth/me", headers={"Authorization": f"Bearer {mint_token(idp_key)}"}
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["global_role"] == "admin"
    assert resp.json()["email"] == "carol@example.com"
    assert resp.json()["display_name"] == "Carol"


@pytest.mark.asyncio
@pytest.mark.parametrize("token", ["W10.e30.x", "bnVsbA.e30.x"])
async def test_bearer_with_a_non_object_jwt_header_is_401(
    unauthenticated_api_client, oidc_settings, jwks_route, token
):
    resp = await unauthenticated_api_client.get(
        "/auth/me", headers={"Authorization": f"Bearer {token}"}
    )

    assert resp.status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "overrides",
    [
        {"aud": ["someone-else"]},
        {"iss": "https://evil.example"},
        {"exp": int(time.time()) - 60},
    ],
)
async def test_bearer_idp_token_with_bad_claims_is_401(
    unauthenticated_api_client, oidc_settings, jwks_route, idp_key, overrides
):
    token = mint_token(idp_key, **overrides)

    resp = await unauthenticated_api_client.get(
        "/auth/me", headers={"Authorization": f"Bearer {token}"}
    )

    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_bearer_idp_token_with_an_unknown_key_is_401(
    unauthenticated_api_client, oidc_settings, jwks_route
):
    token = mint_token(RSAKey.generate_key(2048, auto_kid=True))

    resp = await unauthenticated_api_client.get(
        "/auth/me", headers={"Authorization": f"Bearer {token}"}
    )

    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_bearer_idp_token_for_an_inactive_user_is_401(
    unauthenticated_api_client, oidc_settings, jwks_route, idp_key, db_client
):
    token = mint_token(idp_key, sub="script-1", preferred_username="robot")
    headers = {"Authorization": f"Bearer {token}"}
    await unauthenticated_api_client.get("/auth/me", headers=headers)
    await db_client.db["users"].update_one(
        {"username": "robot"}, {"$set": {"is_active": False}}
    )

    resp = await unauthenticated_api_client.get("/auth/me", headers=headers)

    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_idp_token_in_the_cookie_is_not_accepted(
    unauthenticated_api_client, oidc_settings, jwks_route, idp_key
):
    unauthenticated_api_client.cookies.set(
        config.settings.auth.cookie_name, mint_token(idp_key)
    )

    resp = await unauthenticated_api_client.get("/auth/me")

    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_toktagger_session_token_still_works_as_a_bearer(
    api_client, oidc_settings
):
    resp = await api_client.get("/auth/me")

    assert resp.status_code == 200
    assert resp.json()["username"] == "admin"


@pytest.mark.asyncio
async def test_internal_token_still_works_with_an_idp_registered(
    unauthenticated_api_client, oidc_settings
):
    resp = await unauthenticated_api_client.get(
        "/auth/me", headers={"Authorization": f"Bearer {get_internal_token()}"}
    )

    assert resp.status_code == 200
    assert resp.json()["username"] == "__internal__"


@pytest.mark.asyncio
async def test_garbage_bearer_is_401_without_an_idp(unauthenticated_api_client):
    resp = await unauthenticated_api_client.get(
        "/auth/me", headers={"Authorization": "Bearer not-a-token"}
    )

    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_forged_toktagger_token_is_401_with_an_idp(
    unauthenticated_api_client, oidc_settings, jwks_route
):
    forged = create_access_token({"sub": "ghost"})

    resp = await unauthenticated_api_client.get(
        "/auth/me", headers={"Authorization": f"Bearer {forged}"}
    )

    assert resp.status_code == 401
