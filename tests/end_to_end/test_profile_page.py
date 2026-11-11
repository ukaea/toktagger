import re

import pytest
import requests

pytest.importorskip("playwright")
from playwright.sync_api import expect

from tests.end_to_end.conftest import login_as
from tests.endpoints import create_user

PROFILE_URL = "http://localhost:8002/ui/profile"
ME_URL = "http://localhost:8002/auth/me"


def test_profile_shows_own_details_read_only(server_setup, admin_token, browser):
    create_user("profuser1", "profuser1_pass")
    user_page = login_as(browser, "profuser1", "profuser1_pass")
    user_page.goto(PROFILE_URL)

    def field(text: str):
        return user_page.get_by_role("none").filter(has_text=re.compile(f"^{text}$"))

    for text in ["Username", "Name", "Email", "profuser1@localhost", "Role", "user"]:
        expect(field(text)).to_be_visible()
    # Shown as both username and name, because Canaille sets the formatted name to it.
    expect(field("profuser1")).to_have_count(2)
    details = user_page.get_by_test_id("profile-details")
    expect(details.get_by_role("textbox")).to_have_count(0)
    expect(user_page.get_by_role("button", name="Change Password")).to_have_count(0)

    user_page.context.close()


@pytest.mark.parametrize("purpose", ["API", "MCP"])
def test_bearer_token_create_use_and_revoke(server_setup, admin_token, page, purpose):
    page.goto(PROFILE_URL)
    create_form = page.get_by_role("form", name=f"Create {purpose} Token", exact=True)
    create_form.get_by_role("textbox", name="Token name").fill("e2e script")
    with page.expect_response(
        lambda response: (
            response.url.endswith("/users/me/tokens")
            and response.request.method == "POST"
        )
    ):
        create_form.get_by_role("button", name="Create token").click()

    token_field = page.get_by_role("textbox", name=f"New {purpose} Token", exact=True)
    token = token_field.input_value()
    assert token.startswith(f"tt_{purpose.lower()}_")
    session_user = page.request.get(ME_URL)
    assert session_user.status == 200

    user_url = f"http://localhost:8002/users/{session_user.json()['_id']}"
    me = requests.get(user_url, headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["username"] == "admin"

    page.context.grant_permissions(["clipboard-read", "clipboard-write"])
    page.get_by_role("button", name=f"Copy {purpose} Token").click()
    expect(page.get_by_text("Copied to the clipboard")).to_be_visible()
    assert page.evaluate("navigator.clipboard.readText()") == token

    page.reload()
    expect(page.get_by_role("button", name="Revoke e2e script")).to_be_visible()
    expect(token_field).to_have_count(0)
    assert token not in page.content()

    page.get_by_role("button", name="Revoke e2e script").click()
    with page.expect_response(
        lambda response: (
            "/users/me/tokens/" in response.url and response.request.method == "DELETE"
        )
    ):
        page.get_by_role("dialog").get_by_role("button", name="Revoke").click()
    expect(page.get_by_role("button", name="Revoke e2e script")).to_have_count(0)

    me = requests.get(user_url, headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 401
