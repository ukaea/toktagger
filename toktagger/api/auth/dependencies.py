import secrets

from fastapi import Depends, HTTPException, Request, Response
from fastapi.security import OAuth2PasswordBearer

from toktagger.api import config
from toktagger.api.auth.core import (
    ACCESS_TOKEN_RENEW_AFTER_SECONDS,
    create_access_token,
    decode_token_with_age,
    get_internal_token,
)
from toktagger.api.auth.cookies import set_session_cookies
from toktagger.api.crud import utils
from toktagger.api.schemas.projects import ProjectMember
from toktagger.api.schemas.users import UserOut

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token", auto_error=False)

_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})

_INTERNAL_USER = UserOut(
    id="000000000000000000000001",
    username="__internal__",
    global_role="admin",
    is_active=True,
)


def _require_csrf(request: Request, payload: dict):
    """Reject unsafe cookie-authenticated requests without a matching CSRF header.

    The expected value is read from the signed token rather than the CSRF cookie, so
    an attacker who can set cookies on this host still cannot forge a matching pair.
    """
    if request.method in _SAFE_METHODS:
        return

    expected = payload.get("csrf")
    submitted = request.headers.get("X-CSRF-Token", "")
    if not isinstance(expected, str) or not secrets.compare_digest(submitted, expected):
        raise HTTPException(
            status_code=403,
            detail="CSRF token missing or invalid. Please sign in again.",
        )


def _renew_session(request: Request, response: Response, payload: dict):
    """Slide the session window by re-issuing the cookies on the current response.

    The csrf claim is carried over unchanged, so a request already in flight with the
    old header still validates against the new token.
    """
    csrf = payload.get("csrf")
    if not isinstance(csrf, str):
        return
    set_session_cookies(request, response, create_access_token(dict(payload)), csrf)


async def get_current_user(
    request: Request,
    response: Response,
    header_token: str | None = Depends(oauth2_scheme),
) -> UserOut:
    # Header first: Ray-worker callbacks, scripts and tests never send a cookie, and an
    # explicit header should beat whatever session the same browser happens to hold.
    token = header_token or request.cookies.get(config.settings.auth.cookie_name)
    if token is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Internal server-to-server token used by Ray-worker callbacks (sender.py).
    if secrets.compare_digest(token, get_internal_token()):
        return _INTERNAL_USER

    try:
        payload, token_age = decode_token_with_age(token)
        username = payload.get("sub")
        if not username or not isinstance(username, str):
            raise ValueError("Token is missing a subject claim")
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    # A bearer header cannot be attached by a cross-site caller, so only the ambient
    # cookie credential needs CSRF cover.
    if header_token is None:
        _require_csrf(request, payload)

    db_client = request.app.state.db_client
    user = await utils.get_user_by_username(db_client, username)
    # 401 rather than 404/403: the signature is good but the credential no longer
    # identifies a usable account, and 401 is what the frontend signs out on.
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Account is inactive")

    # Only the ambient cookie slides; a bearer caller manages its own token.
    if header_token is None and token_age >= ACCESS_TOKEN_RENEW_AFTER_SECONDS:
        _renew_session(request, response, payload)
    return user


async def require_password_changed(
    current_user: UserOut = Depends(get_current_user),
) -> UserOut:
    """Hold an account on a forced password change until it supplies a new one.

    The bootstrap admin ships with a public default password, so until it is replaced
    the account is treated as not yet usable. Applied to the data routers rather than
    inside get_current_user, so /auth/me and the self-service password change stay
    reachable for the account being held.
    """
    if current_user.must_change_password:
        raise HTTPException(
            status_code=403,
            detail="You must change your password before using TokTagger.",
        )
    return current_user


async def require_global_admin(
    current_user: UserOut = Depends(get_current_user),
) -> UserOut:
    if current_user.global_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


async def get_project_membership(
    project_id: str,
    request: Request,
    current_user: UserOut = Depends(get_current_user),
) -> ProjectMember | None:
    """Return the membership record, or None for global admins (unrestricted)."""
    if current_user.global_role == "admin":
        return None

    db_client = request.app.state.db_client
    membership = await utils.get_project_membership(
        db_client, project_id, current_user.id
    )
    if not membership:
        raise HTTPException(
            status_code=403, detail="You are not a member of this project"
        )
    return membership


async def require_project_viewer(
    membership: ProjectMember | None = Depends(get_project_membership),
    current_user: UserOut = Depends(get_current_user),
) -> UserOut:
    """Any project member (viewer, annotator, admin) may access read-only resources."""
    return current_user


async def require_project_annotator(
    membership: ProjectMember | None = Depends(get_project_membership),
    current_user: UserOut = Depends(get_current_user),
) -> UserOut:
    if current_user.global_role == "admin":
        return current_user
    # Only roles explicitly allowed to write pass. `membership is None` reaches here
    # only if get_project_membership ever stops raising for non-members, so fail
    # closed on it rather than relying on that behaviour.
    if membership is None or membership.role not in ("admin", "annotator"):
        raise HTTPException(
            status_code=403, detail="Viewers cannot create or modify annotations"
        )
    return current_user


async def require_project_admin_role(
    membership: ProjectMember | None = Depends(get_project_membership),
    current_user: UserOut = Depends(get_current_user),
) -> UserOut:
    if current_user.global_role == "admin":
        return current_user

    if membership is None or membership.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Project admin access required",
        )
    return current_user
