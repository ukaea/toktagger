import re

import pytest

pytest.importorskip("playwright")
from playwright.sync_api import expect

from tests.end_to_end.conftest import login_as
from tests.endpoints import create_user

PROFILE_URL = "http://localhost:8002/ui/profile"


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
    expect(user_page.get_by_role("textbox")).to_have_count(0)
    expect(user_page.get_by_role("button", name="Change Password")).to_have_count(0)

    user_page.context.close()


def test_profile_links_to_account_management(server_setup, admin_token, page):
    page.goto(PROFILE_URL)
    link = page.get_by_role("link", name="Manage account")
    expect(link).to_be_visible()
    expect(link).to_have_attribute("href", "http://localhost:8003/")
