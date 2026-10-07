from typing import Annotated, Literal

from pydantic import BaseModel, Field

from toktagger.api.schemas import ConfiguredModel

MIN_PASSWORD_LENGTH = 8


class UserBase(ConfiguredModel):
    """Shared fields for user models."""

    global_role: Literal["admin", "user"] = "user"
    is_active: bool = True
    must_change_password: bool = False
    email: str | None = None
    display_name: str | None = None


class UserIn(UserBase):
    username: str
    hashed_password: str | None = None
    oidc_issuer: str | None = None
    oidc_sub: str | None = None


class UserOut(UserBase):
    id: str = Field(..., alias="_id")
    username: str


class UserCreate(BaseModel):
    username: str
    password: Annotated[str, Field(min_length=MIN_PASSWORD_LENGTH)]
    global_role: Literal["admin", "user"] = "user"


class UserUpdate(BaseModel):
    global_role: Literal["admin", "user"] | None = None
    is_active: bool | None = None
    password: Annotated[str, Field(min_length=MIN_PASSWORD_LENGTH)] | None = None
    must_change_password: bool | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
