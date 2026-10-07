import logging
import time

from fastapi import Request, Response

from toktagger.api import config
from toktagger.api.auth.core import ACCESS_TOKEN_EXPIRE_SECONDS

logger = logging.getLogger(__name__)

CSRF_COOKIE_NAME = "tt_csrf"
ID_TOKEN_COOKIE_NAME = "tt_id_token"
MAX_ID_TOKEN_COOKIE_BYTES = 3800


def _cookie_secure(request: Request) -> bool:
    configured = config.settings.auth.cookie_secure
    if configured is not None:
        return configured
    # Derived rather than defaulted: a hardcoded True silently drops the cookie over
    # plain HTTP, which surfaces as a login that hangs with nothing in the server log.
    return (
        request.url.scheme == "https" or config.settings.auth.cookie_samesite == "none"
    )


def session_seconds_left(auth_time: int) -> int:
    """Seconds until a session that started at `auth_time` reaches its maximum age."""
    max_age = config.settings.auth.session_max_age_seconds
    return auth_time + max_age - int(time.time())


def set_session_cookies(
    request: Request,
    response: Response,
    token: str,
    csrf: str,
    auth_time: int,
    id_token: str | None = None,
):
    """Store the session token and its CSRF partner on the response.

    The provider ID token is kept httpOnly so logout can send it as `id_token_hint`.

    The session cookie is httpOnly so no script can read it; the CSRF cookie is
    deliberately readable, because the frontend must echo it back in a header.
    """
    secure = _cookie_secure(request)
    samesite = config.settings.auth.cookie_samesite
    max_age = max(0, min(ACCESS_TOKEN_EXPIRE_SECONDS, session_seconds_left(auth_time)))
    response.set_cookie(
        config.settings.auth.cookie_name,
        token,
        max_age=max_age,
        httponly=True,
        secure=secure,
        samesite=samesite,
        path="/",
    )
    response.set_cookie(
        CSRF_COOKIE_NAME,
        csrf,
        max_age=max_age,
        httponly=False,
        secure=secure,
        samesite=samesite,
        path="/",
    )
    if id_token and len(id_token) > MAX_ID_TOKEN_COOKIE_BYTES:
        # Browsers drop cookies over about 4 KB, so logout goes without id_token_hint.
        logger.warning(
            "The provider ID token is %d bytes, too large for a cookie. Sign-out will "
            "not include id_token_hint. Remove large claims, such as groups, from the "
            "ID token at the provider.",
            len(id_token),
        )
    elif id_token:
        response.set_cookie(
            ID_TOKEN_COOKIE_NAME,
            id_token,
            max_age=max_age,
            httponly=True,
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
    """Expire the session cookies, matching the attributes they were set with."""
    secure = _cookie_secure(request)
    samesite = config.settings.auth.cookie_samesite
    names = (config.settings.auth.cookie_name, CSRF_COOKIE_NAME, ID_TOKEN_COOKIE_NAME)
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
