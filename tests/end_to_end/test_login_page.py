import pytest

pytest.importorskip("playwright")
from playwright.sync_api import expect

from tests.conftest import E2E_ADMIN_PASSWORD
from tests import endpoints

BASE_URL = "http://localhost:8002"


def _sign_in_at_provider(page, username, password):
    page.get_by_role("textbox", name="Login").fill(username)
    page.get_by_role("button", name="Continue").click()
    page.get_by_role("textbox", name="Password").fill(password)
    page.get_by_role("button", name="Sign in").click()


def test_sign_in_through_identity_provider(server_setup, guest_page):
    guest_page.goto(f"{BASE_URL}/ui/login")
    guest_page.get_by_role("button", name="Sign In").click()
    _sign_in_at_provider(guest_page, "admin", E2E_ADMIN_PASSWORD)
    expect(guest_page).to_have_url(f"{BASE_URL}/ui/projects", timeout=10000)


def test_sign_in_returns_to_the_requested_page(server_setup, guest_page):
    guest_page.goto(f"{BASE_URL}/ui/admin/users")
    expect(guest_page).to_have_url(
        f"{BASE_URL}/ui/login?return_to=%2Fui%2Fadmin%2Fusers", timeout=3000
    )
    guest_page.get_by_role("button", name="Sign In").click()
    _sign_in_at_provider(guest_page, "admin", E2E_ADMIN_PASSWORD)
    expect(guest_page).to_have_url(f"{BASE_URL}/ui/admin/users", timeout=10000)


def test_regular_user_signs_in(server_setup, guest_page):
    endpoints.identity_provider.create_user("dave", "dave_pass123")
    guest_page.goto(f"{BASE_URL}/ui/login")
    guest_page.get_by_role("button", name="Sign In").click()
    _sign_in_at_provider(guest_page, "dave", "dave_pass123")
    expect(guest_page).to_have_url(f"{BASE_URL}/ui/projects", timeout=10000)


def test_login_page_shows_provider_error(server_setup, guest_page):
    guest_page.goto(f"{BASE_URL}/ui/login?error=inactive")
    expect(guest_page.get_by_text("This account is deactivated")).to_be_visible()


def test_login_page_shows_generic_error_for_unknown_code(server_setup, guest_page):
    guest_page.goto(f"{BASE_URL}/ui/login?error=whatever")
    expect(guest_page.get_by_text("Sign-in failed. Try again.")).to_be_visible()


def test_already_logged_in_user_redirected_away_from_login(server_setup, page):
    # `page` is pre-authenticated as admin (see tests/end_to_end/conftest.py).
    page.goto(f"{BASE_URL}/ui/login")
    expect(page).to_have_url(f"{BASE_URL}/ui/projects/", timeout=3000)


@pytest.mark.parametrize(
    "path",
    [
        "/ui/projects/",
        "/ui/projects/000000000000000000000000",
        "/ui/admin/users",
    ],
)
def test_logged_out_direct_nav_redirects_to_login(server_setup, guest_page, path):
    guest_page.goto(f"{BASE_URL}{path}")
    expect(guest_page).to_have_url(
        f"{BASE_URL}/ui/login?return_to={path.replace('/', '%2F')}", timeout=3000
    )
