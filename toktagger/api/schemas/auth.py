from datetime import datetime
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from toktagger.api import config


EncryptedStr = Annotated[
    str,
    Field(
        pattern=r"^gAAAAA[A-Za-z0-9_-]+=*$",
        description="Fernet ciphertext from encrypt_secret, never the plain value.",
    ),
]


class LogoutResponse(BaseModel):
    logout_url: str | None = None


class ApiTokenCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    expires_in_days: int = Field(30, gt=0)

    @field_validator("expires_in_days")
    @classmethod
    def check_max_lifetime(cls, value: int) -> int:
        max_days = config.settings.auth.api_token_max_lifetime_days
        if value > max_days:
            raise ValueError(f"An API token can be valid for at most {max_days} days")
        return value


class Session(BaseModel):
    user_id: str
    issuer: str
    sub: str
    refresh_token: EncryptedStr
    id_token: EncryptedStr | None = None
    refreshed_at: float


class SessionUpdate(BaseModel):
    refresh_token: EncryptedStr | None = None
    id_token: EncryptedStr | None = None
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
