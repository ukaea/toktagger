from fastapi import Request, Response

from toktagger.api import config
from toktagger.api.auth.core import ACCESS_TOKEN_EXPIRE_SECONDS

CSRF_COOKIE_NAME = "tt_csrf"


def _cookie_secure(request: Request) -> bool:
    configured = config.settings.auth.cookie_secure
    if configured is not None:
        return configured
    # Derived rather than defaulted: a hardcoded True silently drops the cookie over
    # plain HTTP, which surfaces as a login that hangs with nothing in the server log.
    return (
        request.url.scheme == "https" or config.settings.auth.cookie_samesite == "none"
    )


def set_session_cookies(request: Request, response: Response, token: str, csrf: str):
    """Store the session token and its CSRF partner on the response.

    The session cookie is httpOnly so no script can read it; the CSRF cookie is
    deliberately readable, because the frontend must echo it back in a header.
    """
    secure = _cookie_secure(request)
    samesite = config.settings.auth.cookie_samesite
    response.set_cookie(
        config.settings.auth.cookie_name,
        token,
        max_age=ACCESS_TOKEN_EXPIRE_SECONDS,
        httponly=True,
        secure=secure,
        samesite=samesite,
        path="/",
    )
    response.set_cookie(
        CSRF_COOKIE_NAME,
        csrf,
        max_age=ACCESS_TOKEN_EXPIRE_SECONDS,
        httponly=False,
        secure=secure,
        samesite=samesite,
        path="/",
    )


def _drop_queued_cookies(response: Response, names: tuple[str, ...]):
    """Remove Set-Cookie headers already queued for `names` on this response."""
    prefixes = tuple(f"{name}=".encode() for name in names)
    response.raw_headers[:] = [
        (key, value)
        for key, value in response.raw_headers
        if not (key == b"set-cookie" and value.startswith(prefixes))
    ]


def clear_session_cookies(request: Request, response: Response):
    """Expire both session cookies, matching the attributes they were set with."""
    secure = _cookie_secure(request)
    samesite = config.settings.auth.cookie_samesite
    names = (config.settings.auth.cookie_name, CSRF_COOKIE_NAME)
    # A renewal queued by get_current_user would otherwise sit alongside the expiry
    # below and keep the session alive through logout.
    _drop_queued_cookies(response, names)
    for name in names:
        response.delete_cookie(
            name,
            secure=secure,
            samesite=samesite,
            path="/",
        )
