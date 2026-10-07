import logging
import re
import secrets
from urllib.parse import quote, urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse

from toktagger.api import config
from toktagger.api.auth import oidc
from toktagger.api.auth.cookies import (
    ID_TOKEN_COOKIE_NAME,
    clear_session_cookies,
    set_session_cookies,
)
from toktagger.api.auth.core import create_access_token
from toktagger.api.auth.dependencies import get_current_user
from toktagger.api.crud.db import MongoDBClient
from toktagger.api.schemas.auth import AuthConfig, LogoutResponse
from toktagger.api.schemas.users import UserOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Auth"])

DEFAULT_RETURN_TO = "/ui/projects"
LOGIN_PATH = "/ui/login"
RETURN_TO_SESSION_KEY = "return_to"
ERROR_CODE_PATTERN = re.compile(r"[a-z_]{1,40}")


def _login_error(code: str) -> RedirectResponse:
    return RedirectResponse(f"{LOGIN_PATH}?error={quote(code)}", status_code=303)


def _validate_return_to(return_to: str) -> str:
    if not return_to.startswith("/ui/") or "\\" in return_to or "\n" in return_to:
        raise HTTPException(
            status_code=400, detail="return_to must be a path under /ui/"
        )
    return return_to


async def _account_url() -> str | None:
    auth = config.settings.auth
    if auth.provider == "canaille":
        return f"{config.settings.canaille_public_url}/"
    issuer = str(auth.issuer_url)
    if oidc.idp_registered():
        try:
            issuer = (await oidc.get_metadata())["issuer"]
        except oidc.IDP_ERRORS:
            pass
    issuer = issuer.rstrip("/")
    return f"{issuer}/account" if "/realms/" in issuer else None


@router.get("/config", response_model=AuthConfig)
async def get_auth_config() -> AuthConfig:
    return AuthConfig(
        provider=config.settings.auth.provider, account_url=await _account_url()
    )


@router.get("/login")
async def login_redirect(request: Request, return_to: str = DEFAULT_RETURN_TO):
    request.session[RETURN_TO_SESSION_KEY] = _validate_return_to(return_to)
    try:
        return await oidc.get_idp().authorize_redirect(
            request, f"{config.settings.public_url}/auth/callback"
        )
    except oidc.IDP_ERRORS:
        logger.exception("Could not start sign-in with the identity provider")
        return _login_error("idp_unavailable")


@router.get("/callback")
async def callback(request: Request):
    return_to = request.session.pop(RETURN_TO_SESSION_KEY, DEFAULT_RETURN_TO)
    try:
        idp = oidc.get_idp()
        token = await idp.authorize_access_token(request)
        claims = dict(token.get("userinfo") or {})
        if not oidc.extract_roles(claims, config.settings.auth.roles_claim):
            userinfo = await idp.userinfo(token=token)
            if userinfo.get("sub") == claims.get("sub"):
                claims = {**userinfo, **claims}
        issuer = (await oidc.get_metadata())["issuer"]
        db_client: MongoDBClient = request.app.state.db_client
        user = await oidc.provision_user(db_client, issuer, claims)
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

    if not user.is_active:
        return _login_error("inactive")

    request.session.clear()
    csrf = secrets.token_urlsafe(32)
    session_token = create_access_token({"sub": user.username, "csrf": csrf})
    response = RedirectResponse(return_to, status_code=303)
    set_session_cookies(request, response, session_token, csrf, token.get("id_token"))
    return response


@router.get("/me", response_model=UserOut)
async def get_me(current_user: UserOut = Depends(get_current_user)):
    return current_user


async def _end_session_url(id_token: str | None) -> str | None:
    try:
        metadata = await oidc.get_metadata()
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

    The TokTagger token itself stays valid until it expires.
    """
    id_token = request.cookies.get(ID_TOKEN_COOKIE_NAME)
    clear_session_cookies(request, response)
    logout_url = await _end_session_url(id_token) if oidc.idp_registered() else None
    return LogoutResponse(logout_url=logout_url)
