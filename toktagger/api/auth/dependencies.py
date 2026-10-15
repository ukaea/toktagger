import secrets

from fastapi import Depends, HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from toktagger.api import config
from toktagger.api.auth import api_tokens, oidc, sessions
from toktagger.api.auth.core import (
    create_access_token,
    decode_token_with_age,
    get_internal_token,
)
from toktagger.api.auth.cookies import set_session_cookies
from toktagger.api.crud import utils
from toktagger.api.crud.db import LockTimeoutError
from toktagger.api.schemas.projects import ProjectMember
from toktagger.api.schemas.users import UserOut

bearer_scheme = HTTPBearer(auto_error=False)

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


async def _refresh_session(request: Request, response: Response, payload: dict):
    """Read the account from the provider again, then slide the session window.

    The csrf claim is carried over unchanged, so a request already in flight with the
    old header still validates.
    """
    session_id = payload.get("sid")
    csrf = payload.get("csrf")
    if not isinstance(session_id, str) or not isinstance(csrf, str):
        raise HTTPException(status_code=401, detail="Invalid session. Sign in again.")
    try:
        await sessions.refresh_session(
            request.app.state.db_client, oidc.get_idp(request), session_id
        )
    except (sessions.SessionEndedError, ValueError) as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    # Fail closed but keep the session, so it works again once the provider is back.
    except (*oidc.IDP_ERRORS, LockTimeoutError) as exc:
        raise HTTPException(
            status_code=503, detail="The identity provider is not available."
        ) from exc
    set_session_cookies(request, response, create_access_token(dict(payload)), csrf)


def _require_active(user: UserOut) -> UserOut:
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Account is inactive")
    return user


async def _get_user_from_api_token(request: Request, token: str) -> UserOut:
    db_client = request.app.state.db_client
    user_id = await api_tokens.authenticate_api_token(db_client, token)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired API token")
    user = await utils.get_user_by_id(db_client, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists")
    return _require_active(user)


async def _get_user_from_bearer(request: Request, token: str) -> UserOut:
    """Authenticate a bearer header: the internal token, an API token or an IdP token.

    A bearer header cannot be attached by a cross-site caller, so it needs no CSRF
    cover, and the caller manages its own token, so the session does not slide.
    """
    # Internal server-to-server token used by Ray-worker callbacks (sender.py).
    if secrets.compare_digest(token, get_internal_token()):
        return _INTERNAL_USER
    if api_tokens.is_api_token(token):
        return await _get_user_from_api_token(request, token)

    idp: oidc.IdentityProvider | None = request.app.state.idp
    if idp is None:
        raise HTTPException(status_code=401, detail="Invalid bearer token")
    try:
        claims = await idp.verify_access_token(token)
        user = await oidc.provision_user(
            request.app.state.db_client, claims["iss"], claims, sync_profile=False
        )
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    return _require_active(user)


async def _get_user_from_cookie(request: Request, response: Response) -> UserOut:
    """Authenticate the browser session cookie, and refresh it when it is old enough."""
    token = request.cookies.get(config.settings.auth.cookie_name)
    if token is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload, token_age = decode_token_with_age(token)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    username = payload.get("sub")
    if not username or not isinstance(username, str):
        raise HTTPException(status_code=401, detail="Token is missing a subject claim")

    _require_csrf(request, payload)
    request.state.session_id = payload.get("sid")
    if token_age >= config.settings.auth.session_refresh_seconds:
        await _refresh_session(request, response, payload)

    user = await utils.get_user_by_username(request.app.state.db_client, username)
    # 401 rather than 404/403: the signature is good but the credential no longer
    # identifies a usable account, and 401 is what the frontend signs out on.
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists")
    return _require_active(user)


async def get_current_user(
    request: Request,
    response: Response,
    bearer: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> UserOut:
    # Header first: Ray-worker callbacks and scripts never send a cookie, and an
    # explicit header should beat whatever session the same browser happens to hold.
    if bearer is not None:
        request.state.via_session = False
        return await _get_user_from_bearer(request, bearer.credentials)
    request.state.via_session = True
    return await _get_user_from_cookie(request, response)


async def require_session_user(
    request: Request, current_user: UserOut = Depends(get_current_user)
) -> UserOut:
    """Allow only a browser session, so a leaked API token cannot create more tokens."""
    if not request.state.via_session:
        raise HTTPException(
            status_code=403, detail="Sign in with a browser to manage API tokens"
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
