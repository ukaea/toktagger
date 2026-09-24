from typing import Literal

from pydantic import BaseModel, Field

from toktagger.api.schemas import ConfiguredModel


class UserBase(ConfiguredModel):
    """Shared fields for user models."""

    global_role: Literal["admin", "user"] = "user"
    is_active: bool = True
    must_change_password: bool = False


class UserIn(UserBase):
    username: str
    hashed_password: str


class UserOut(UserBase):
    id: str = Field(..., alias="_id")
    username: str


class UserCreate(BaseModel):
    username: str
    password: str
    global_role: Literal["admin", "user"] = "user"


class UserUpdate(BaseModel):
    global_role: Literal["admin", "user"] | None = None
    is_active: bool | None = None
    password: str | None = None
    must_change_password: bool | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
