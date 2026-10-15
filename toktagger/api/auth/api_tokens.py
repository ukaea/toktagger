"""Personal API tokens that TokTagger issues to users for scripts."""

import hashlib
import secrets
import time

from toktagger.api.crud.db import MongoDBClient
from toktagger.api.schemas import convert_to_objectid
from toktagger.api.schemas.auth import (
    ApiToken,
    ApiTokenCreated,
    ApiTokenUpdate,
)

TOKEN_PREFIX = "tt_"
HINT_LENGTH = 4
LAST_USED_RESOLUTION_SECONDS = 60


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def is_api_token(token: str) -> bool:
    return token.startswith(TOKEN_PREFIX)


async def create_api_token(
    db_client: MongoDBClient, user_id: str, name: str, lifetime_seconds: float
) -> ApiTokenCreated:
    """Store a new token for a user and return it. Only its hash is stored."""
    token = TOKEN_PREFIX + secrets.token_urlsafe(32)
    now = time.time()
    api_token = ApiToken(
        name=name,
        token_hash=_hash(token),
        hint=token[-HINT_LENGTH:],
        created_at=now,
        expires_at=now + lifetime_seconds,
    )
    user_object_id = convert_to_objectid(user_id, "users")
    token_id = await db_client.insert(
        "api_tokens", api_token, ids={"user_id": user_object_id}
    )
    return ApiTokenCreated.model_validate(
        {**api_token.model_dump(), "_id": token_id, "token": token}
    )


async def revoke_api_token(
    db_client: MongoDBClient, user_id: str, token_id: str
) -> bool:
    """Delete a token of the user. Return False when the user has no such token."""
    # delete_many, because Mongita's delete_one ignores every other field when _id is set.
    result = await db_client.delete_filtered_documents(
        "api_tokens",
        {
            "_id": convert_to_objectid(token_id, "tokens"),
            "user_id": convert_to_objectid(user_id, "users"),
        },
    )
    return result.deleted_count == 1


async def authenticate_api_token(db_client: MongoDBClient, token: str) -> str | None:
    """Return the user ID that owns a token, or None when it is unknown or expired."""
    documents = await db_client.get_filtered_documents(
        "api_tokens", {"token_hash": _hash(token)}, limit=1
    )
    now = time.time()
    if not documents:
        return None
    document = documents[0]
    api_token = ApiToken.model_validate(document)
    if api_token.expires_at <= now:
        await db_client.delete_filtered_documents(
            "api_tokens", {"_id": document["_id"]}
        )
        return None
    last_used_at = api_token.last_used_at
    # Throttled so that a busy script does not write to the database on every request.
    if last_used_at is None or now - last_used_at >= LAST_USED_RESOLUTION_SECONDS:
        await db_client.update(
            "api_tokens", ApiTokenUpdate(last_used_at=now), document["_id"]
        )
    return str(document["user_id"])
