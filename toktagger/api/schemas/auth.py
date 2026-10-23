from datetime import datetime
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, model_validator


class LogoutResponse(BaseModel):
    logout_url: str | None = None


class ApiTokenCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    expires_in_days: int = Field(30, gt=0)


class Session(BaseModel):
    username: str
    issuer: str
    sub: str
    refresh_token: str
    id_token: str | None = None
    refreshed_at: float


class SessionUpdate(BaseModel):
    refresh_token: str | None = None
    id_token: str | None = None
    refreshed_at: float | None = None


class ApiTokenBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    hint: str = Field(
        ..., min_length=1, max_length=8, description="Last characters of the token."
    )


class ApiToken(ApiTokenBase):
    token_hash: str = Field(..., pattern=r"^[0-9a-f]{64}$")
    created_at: float = Field(..., gt=0)
    expires_at: float = Field(..., gt=0)
    last_used_at: float | None = Field(None, gt=0)

    @model_validator(mode="after")
    def check_expiry_after_creation(self) -> Self:
        if self.expires_at <= self.created_at:
            raise ValueError("expires_at must be later than created_at")
        return self


class ApiTokenUpdate(BaseModel):
    last_used_at: float | None = Field(None, gt=0)


class ApiTokenOut(ApiTokenBase):
    model_config = ConfigDict(validate_by_name=True)

    id: str = Field(..., alias="_id")
    created_at: datetime
    expires_at: datetime
    last_used_at: datetime | None = None


class ApiTokenCreated(ApiTokenOut):
    token: str = Field(..., description="The token. The server shows it one time only.")
