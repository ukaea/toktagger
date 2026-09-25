import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import OAuth2PasswordRequestForm

from toktagger.api.auth.cookies import clear_session_cookies, set_session_cookies
from toktagger.api.auth.core import create_access_token, verify_password
from toktagger.api.auth.dependencies import get_current_user
from toktagger.api.crud import utils
from toktagger.api.crud.db import MongoDBClient
from toktagger.api.schemas.users import TokenResponse, UserOut

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/token", response_model=TokenResponse)
async def login(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
):
    db_client: MongoDBClient = request.app.state.db_client
    # Raw doc lookup is intentional: UserOut deliberately omits hashed_password.
    user_doc = await utils.get_user_doc_by_username(db_client, form_data.username)
    if not user_doc:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if not verify_password(form_data.password, user_doc.get("hashed_password", "")):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if not user_doc.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account is inactive")

    csrf = secrets.token_urlsafe(32)
    token = create_access_token({"sub": user_doc["username"], "csrf": csrf})
    set_session_cookies(request, response, token, csrf)
    # Browsers use the cookie; the body keeps scripted and server-to-server clients working.
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserOut)
async def get_me(current_user: UserOut = Depends(get_current_user)):
    return current_user


@router.post("/logout", status_code=204)
async def logout(
    request: Request,
    response: Response,
    current_user: UserOut = Depends(get_current_user),
):
    """Clear the session cookies. The token itself stays valid until it expires."""
    clear_session_cookies(request, response)
