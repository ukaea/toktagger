"""Personal bearer tokens that TokTagger issues to users."""

import hashlib
import secrets
import time
from typing import Literal

from toktagger.api.crud.db import MongoDBClient
from toktagger.api.schemas import convert_to_objectid
from toktagger.api.schemas.auth import (
    BearerToken,
    BearerTokenCreated,
    BearerTokenUpdate,
)

TOKEN_PREFIX = "tt"
HINT_LENGTH = 4
LAST_USED_RESOLUTION_SECONDS = 60


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def is_bearer_token(token: str) -> bool:
    return token.startswith(TOKEN_PREFIX)


async def create_bearer_token(
    db_client: MongoDBClient,
    user_id: str,
    name: str,
    lifetime_seconds: float,
    *,
    purpose: Literal["api", "mcp"] = "api",
) -> BearerTokenCreated:
    """Store a new token for a user and return it. Only its hash is stored."""
    prefix = f"{TOKEN_PREFIX}_{purpose}_"
    token = prefix + secrets.token_urlsafe(32)
    now = time.time()
    bearer_token = BearerToken(
        purpose=purpose,
        name=name,
        token_hash=_hash(token),
        hint=token[-HINT_LENGTH:],
        created_at=now,
        expires_at=now + lifetime_seconds,
    )
    user_object_id = convert_to_objectid(user_id, "users")
    token_id = await db_client.insert(
        "bearer_tokens", bearer_token, ids={"user_id": user_object_id}
    )
    return BearerTokenCreated.model_validate(
        {**bearer_token.model_dump(), "_id": token_id, "token": token}
    )


async def revoke_bearer_token(
    db_client: MongoDBClient,
    user_id: str,
    token_id: str,
) -> bool:
    """Delete a token owned by the user."""
    result = await db_client.delete_filtered_documents(
        "bearer_tokens",
        {
            "_id": convert_to_objectid(token_id, "tokens"),
            "user_id": convert_to_objectid(user_id, "users"),
        },
    )
    return result.deleted_count == 1


async def authenticate_bearer_token(
    db_client: MongoDBClient,
    token: str,
    purpose: Literal["api", "mcp"] | None = "api",
) -> str | None:
    """Return the owner of a valid token; purpose=None accepts either purpose."""
    documents = await db_client.get_filtered_documents(
        "bearer_tokens", {"token_hash": _hash(token)}, limit=1
    )
    now = time.time()
    if not documents:
        return None
    document = documents[0]
    bearer_token = BearerToken.model_validate(document)
    if purpose is not None and bearer_token.purpose != purpose:
        return None
    if bearer_token.expires_at <= now:
        await db_client.delete_filtered_documents(
            "bearer_tokens", {"_id": document["_id"]}
        )
        return None
    last_used_at = bearer_token.last_used_at
    # Throttled so that a busy script does not write to the database on every request.
    if last_used_at is None or now - last_used_at >= LAST_USED_RESOLUTION_SECONDS:
        await db_client.update(
            "bearer_tokens", BearerTokenUpdate(last_used_at=now), document["_id"]
        )
    return str(document["user_id"])
