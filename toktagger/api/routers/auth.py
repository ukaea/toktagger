import logging
import re
import secrets
from urllib.parse import quote, urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse

from toktagger.api import config
from toktagger.api.auth import oidc, sessions
from toktagger.api.auth.cookies import clear_session_cookies, set_session_cookies
from toktagger.api.auth.core import create_access_token
from toktagger.api.auth.dependencies import get_current_user
from toktagger.api.crud.db import MongoDBClient
from toktagger.api.schemas.auth import LogoutResponse
from toktagger.api.schemas.users import UserOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Auth"])

DEFAULT_RETURN_TO = "/ui/projects"
LOGIN_PATH = "/ui/login"
ERROR_CODE_PATTERN = re.compile(r"[a-z_]{1,40}")
FORCE_LOGIN_KEY = "force_login"


def _login_error(code: str) -> RedirectResponse:
    return RedirectResponse(f"{LOGIN_PATH}?error={quote(code)}", status_code=303)


def _validate_return_to(return_to: str) -> str:
    if not return_to.startswith("/ui/") or "\\" in return_to or "\n" in return_to:
        raise HTTPException(
            status_code=400, detail="return_to must be a path under /ui/"
        )
    return return_to


@router.get("/login")
async def login_redirect(
    request: Request,
    return_to: str = DEFAULT_RETURN_TO,
    idp: oidc.IdentityProvider = Depends(oidc.get_idp),
):
    request.session["return_to"] = _validate_return_to(return_to)
    # The provider session still holds the refused account, so make the provider ask again.
    extra = {"prompt": "login"} if request.session.pop(FORCE_LOGIN_KEY, False) else {}
    try:
        return await idp.client.authorize_redirect(
            request, f"{config.settings.public_url}/auth/callback", **extra
        )
    except oidc.IDP_ERRORS:
        logger.exception("Could not start sign-in with the identity provider")
        return _login_error("idp_unavailable")


@router.get("/callback")
async def callback(
    request: Request, idp: oidc.IdentityProvider = Depends(oidc.get_idp)
):
    db_client: MongoDBClient = request.app.state.db_client
    return_to = request.session.pop("return_to", DEFAULT_RETURN_TO)
    try:
        token = await idp.client.authorize_access_token(request)
        claims = token.get("userinfo") or {}
        if not oidc.extract_roles(claims, config.settings.auth.roles_claim):
            userinfo = await idp.client.userinfo(token=token)
            if not claims.get("sub") or userinfo.get("sub") == claims.get("sub"):
                claims = {**userinfo, **claims}
        issuer = (await idp.metadata())["issuer"]
        user = await oidc.provision_user(db_client, issuer, claims)
        if not user.is_active:
            request.session[FORCE_LOGIN_KEY] = True
            return _login_error("inactive")
        session_id = await sessions.start_session(
            db_client, user.username, issuer, claims["sub"], token
        )
    except oidc.OAuthError as error:
        code = error.error or ""
        return _login_error(
            code if ERROR_CODE_PATTERN.fullmatch(code) else "login_failed"
        )
    except oidc.IDP_ERRORS:
        logger.exception("Sign-in with the identity provider failed")
        return _login_error("idp_unavailable")
    except ValueError:
        logger.exception("The identity provider returned unusable claims")
        return _login_error("login_failed")

    request.session.clear()
    csrf = secrets.token_urlsafe(32)
    session_token = create_access_token(
        {"sub": user.username, "csrf": csrf, "sid": session_id}
    )
    response = RedirectResponse(return_to, status_code=303)
    set_session_cookies(request, response, session_token, csrf)
    return response


@router.get("/me", response_model=UserOut)
async def get_me(current_user: UserOut = Depends(get_current_user)):
    return current_user


async def _end_session_url(
    idp: oidc.IdentityProvider, id_token: str | None
) -> str | None:
    try:
        metadata = await idp.metadata()
    except oidc.IDP_ERRORS:
        logger.exception("Could not read the identity provider metadata")
        return None
    endpoint = metadata.get("end_session_endpoint")
    if not endpoint:
        return None
    params = {
        "client_id": config.settings.auth.client_id,
        "post_logout_redirect_uri": f"{config.settings.public_url}{LOGIN_PATH}",
    }
    if id_token:
        params["id_token_hint"] = id_token
    query = urlencode(params)
    return f"{endpoint}?{query}"


@router.post("/logout", response_model=LogoutResponse)
async def logout(
    request: Request,
    response: Response,
    current_user: UserOut = Depends(get_current_user),
) -> LogoutResponse:
    """Clear the session cookies and return the provider sign-out URL, if it has one.

    The URL carries the ID token as `id_token_hint`, so the provider signs out without asking.

    The session record is removed, so a copy of the cookie stops working at its next refresh.
    """
    id_token = None
    session_id = getattr(request.state, "session_id", None)
    if isinstance(session_id, str):
        id_token = await sessions.end_session(request.app.state.db_client, session_id)
    clear_session_cookies(request, response)
    idp: oidc.IdentityProvider | None = request.app.state.idp
    logout_url = await _end_session_url(idp, id_token) if idp is not None else None
    return LogoutResponse(logout_url=logout_url)
