"""Sign in through the managed Canaille server over plain HTTP, for test setup."""

import functools
import re

import requests

from toktagger.api import config
from toktagger.api.auth.cookies import CSRF_COOKIE_NAME

TOKTAGGER_URL = "http://localhost:8002"
CSRF_PATTERN = re.compile(
    r'<input[^>]*name="csrf_token"[^>]*value="([^"]+)"|'
    r'<input[^>]*value="([^"]+)"[^>]*name="csrf_token"'
)


def _csrf_token(html: str) -> str:
    match = CSRF_PATTERN.search(html)
    assert match, f"no csrf_token field in the sign-in page: {html[:300]}"
    return match.group(1) or match.group(2)


def _page_text(page: requests.Response) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", page.text))[-300:]


def sign_in(username: str, password: str) -> requests.Session:
    """Run the authorization-code flow and return a session holding TokTagger's cookies."""
    session = requests.Session()
    page = session.get(
        f"{TOKTAGGER_URL}/auth/login", params={"return_to": "/ui/projects"}
    )
    assert page.status_code == 200, page.text[:300]
    page = session.post(
        page.url, data={"csrf_token": _csrf_token(page.text), "login": username}
    )
    assert 'name="password"' in page.text, f"unknown user {username}: {page.text[:300]}"
    page = session.post(
        page.url, data={"csrf_token": _csrf_token(page.text), "password": password}
    )
    returned = page.url.startswith(f"{TOKTAGGER_URL}/ui/") and "error=" not in page.url
    assert returned, (
        f"sign-in did not return to TokTagger: {page.url} {_page_text(page)}"
    )
    return session


@functools.cache
def session_cookies(username: str, password: str) -> dict[str, str]:
    """TokTagger's session cookies for a user, signing in only once per user.

    Canaille issues identical tokens to one user who signs in twice in the same second,
    and then fails with a unique-constraint error, so tests share one sign-in per user.
    """
    session = sign_in(username, password)
    return {
        name: session.cookies[name]
        for name in (config.settings.auth.cookie_name, CSRF_COOKIE_NAME)
    }
