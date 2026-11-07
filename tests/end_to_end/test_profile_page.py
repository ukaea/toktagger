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


def test_api_token_create_use_and_revoke(server_setup, admin_token, page):
    page.goto(PROFILE_URL)
    page.get_by_role("textbox", name="Token name").fill("e2e script")
    with page.expect_response(
        lambda response: (
            response.url.endswith("/users/me/tokens")
            and response.request.method == "POST"
        )
    ):
        page.get_by_role("button", name="Create token").click()

    token = page.get_by_role("textbox", name="New API token").input_value()
    assert token.startswith("tt_")
    me = requests.get(ME_URL, headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["username"] == "admin"

    page.context.grant_permissions(["clipboard-read", "clipboard-write"])
    page.get_by_role("button", name="Copy").click()
    expect(page.get_by_text("Copied to the clipboard")).to_be_visible()
    assert page.evaluate("navigator.clipboard.readText()") == token

    page.reload()
    expect(page.get_by_role("button", name="Revoke e2e script")).to_be_visible()
    expect(page.get_by_role("textbox", name="New API token")).to_have_count(0)
    assert token not in page.content()

    page.get_by_role("button", name="Revoke e2e script").click()
    with page.expect_response(
        lambda response: (
            "/users/me/tokens/" in response.url and response.request.method == "DELETE"
        )
    ):
        page.get_by_role("dialog").get_by_role("button", name="Revoke").click()
    expect(page.get_by_role("button", name="Revoke e2e script")).to_have_count(0)

    me = requests.get(ME_URL, headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 401
