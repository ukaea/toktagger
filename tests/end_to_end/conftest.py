import pytest
import requests

try:
    from playwright.sync_api import Page
except ImportError:
    Page = None  # type: ignore[assignment,misc]


def _cookie_args(cookies: dict[str, str]) -> list[dict[str, str]]:
    """Shape a name/value mapping for Playwright's add_cookies.

    Passing `url` lets Playwright derive the domain and path; an explicit domain
    would have to be port-less ("localhost"), which is an easy silent mistake.
    """
    return [
        {"name": name, "value": value, "url": "http://localhost:8002"}
        for name, value in cookies.items()
    ]


def login_as(browser, username: str, password: str) -> Page:
    """Return a fresh page authenticated as a specific (non-default) user.

    Logs in via the real API (not the UI form) and copies the session cookies it set
    into a brand-new context, so they're in place before that context's first
    navigation. Deliberately a new context rather than reusing `page`, whose own
    cookies (below) are already seeded as the bootstrap admin.
    """
    session = requests.Session()
    response = session.post(
        "http://localhost:8002/auth/token",
        data={"username": username, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert response.status_code == 200, response.text
    context = browser.new_context()
    context.add_cookies(_cookie_args(dict(session.cookies)))
    return context.new_page()


@pytest.fixture
def page(page: Page, admin_cookies: dict[str, str]) -> Page:
    """pytest-playwright's page, pre-authenticated as the bootstrap admin.

    Every existing/new e2e test that just needs *some* logged-in session
    gets one for free via this override — no per-test login boilerplate.
    Tests that need a specific non-admin identity should call login_as();
    tests that need a genuinely logged-out browser should use guest_page.
    """
    page.context.add_cookies(_cookie_args(admin_cookies))
    return page


@pytest.fixture
def guest_page(browser) -> Page:
    """A fresh, unauthenticated page/context — for testing the login flow
    itself and other logged-out scenarios. Deliberately bypasses the `page`
    override above, which always seeds a valid admin session.
    """
    context = browser.new_context()
    guest_page = context.new_page()
    yield guest_page
    context.close()
