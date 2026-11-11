from typing import Literal

from pydantic import BaseModel, Field

from toktagger.api.schemas import ConfiguredModel


class UserBase(ConfiguredModel):
    """Shared fields for user models."""

    global_role: Literal["admin", "user"] = "user"
    is_active: bool = True
    email: str | None = None
    display_name: str | None = None


class UserIn(UserBase):
    username: str
    oidc_issuer: str
    oidc_sub: str


class UserOut(UserBase):
    id: str = Field(..., alias="_id")
    username: str


class UserUpdate(BaseModel):
    is_active: bool | None = None
