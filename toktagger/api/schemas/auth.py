from typing import Literal

from pydantic import BaseModel


class AuthConfig(BaseModel):
    provider: Literal["canaille", "oidc"]
    account_url: str | None = None


class LogoutResponse(BaseModel):
    logout_url: str | None = None
