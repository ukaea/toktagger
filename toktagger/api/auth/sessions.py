"""Browser sessions, each tied to a refresh token at the identity provider."""

import secrets
import time
from typing import Any

from cryptography.fernet import InvalidToken

from toktagger.api import config
from toktagger.api.auth import oidc
from toktagger.api.auth.core import decrypt_secret, encrypt_secret
from toktagger.api.crud.db import MongoDBClient
from toktagger.api.schemas.auth import Session, SessionUpdate


class SessionEndedError(Exception):
    """Raised when a session can no longer be used, so the user must sign in again."""


async def start_session(
    db_client: MongoDBClient,
    user_id: str,
    issuer: str,
    sub: str,
    token: dict[str, Any],
) -> str:
    """Store a new session for a signed-in user and return its id.

    Raises ValueError when the provider did not return a refresh token.
    """
    refresh_token = token.get("refresh_token")
    if not isinstance(refresh_token, str):
        raise ValueError("The identity provider returned no refresh token")
    id_token = token.get("id_token")
    now = time.time()
    idle_cutoff = now - config.settings.auth.session_idle_timeout_seconds
    await db_client.delete_filtered_documents(
        "sessions", {"refreshed_at": {"$lt": idle_cutoff}}
    )
    session_id = secrets.token_urlsafe(32)
    await db_client.insert(
        "sessions",
        Session(
            user_id=user_id,
            issuer=issuer,
            sub=sub,
            refresh_token=encrypt_secret(refresh_token),
            id_token=encrypt_secret(id_token) if isinstance(id_token, str) else None,
            refreshed_at=now,
        ),
        ids={"_id": session_id},
    )
    return session_id


async def refresh_session(
    db_client: MongoDBClient, idp: oidc.IdentityProvider, session_id: str
) -> None:
    """Read the account from the provider again and update the local user from it.

    A lock shared by all workers serialises the refresh, because the provider can
    revoke a refresh token once it is used. A request that waited for the lock
    finds the session already refreshed and returns.

    Raises SessionEndedError when the session is unknown or the provider ends it.
    """
    async with db_client.lock(f"sessions:{session_id}"):
        document = await db_client.get_document_by_id("sessions", session_id)
        if document is None:
            raise SessionEndedError("Session ended. Sign in again.")
        session = Session.model_validate(document)
        if (
            time.time() - session.refreshed_at
            < config.settings.auth.session_refresh_seconds
        ):
            return

        try:
            refresh_token = decrypt_secret(session.refresh_token)
        except InvalidToken as exc:
            await db_client.delete_document_by_id("sessions", session_id)
            raise SessionEndedError("Session ended. Sign in again.") from exc
        try:
            token = await idp.client.fetch_access_token(
                grant_type="refresh_token", refresh_token=refresh_token
            )
        except oidc.OAuthError as exc:
            await db_client.delete_document_by_id("sessions", session_id)
            raise SessionEndedError(
                "The identity provider ended the session. Sign in again."
            ) from exc
        id_token = token.get("id_token")
        # Saved before userinfo, so a failure there does not lose a rotated refresh token.
        await db_client.update(
            "sessions",
            SessionUpdate(
                refresh_token=encrypt_secret(token.get("refresh_token", refresh_token)),
                id_token=encrypt_secret(id_token)
                if isinstance(id_token, str)
                else session.id_token,
            ),
            session_id,
        )

        claims = dict(await idp.client.userinfo(token=token))
        if claims.get("sub") != session.sub:
            await db_client.delete_document_by_id("sessions", session_id)
            raise SessionEndedError(
                "The identity provider returned a different account. Sign in again."
            )
        user = await oidc.provision_user(db_client, session.issuer, claims)
        if user.id != session.user_id:
            await db_client.delete_document_by_id("sessions", session_id)
            raise SessionEndedError("Session ended. Sign in again.")
        await db_client.update(
            "sessions", SessionUpdate(refreshed_at=time.time()), session_id
        )


async def end_session(db_client: MongoDBClient, session_id: str) -> str | None:
    """Remove a session and return its provider ID token, for the sign-out hint."""
    document = await db_client.get_document_by_id("sessions", session_id)
    await db_client.delete_document_by_id("sessions", session_id)
    if document is None:
        return None
    id_token = Session.model_validate(document).id_token
    if id_token is None:
        return None
    try:
        return decrypt_secret(id_token)
    except InvalidToken:
        return None


async def end_user_sessions(db_client: MongoDBClient, user_id: str) -> None:
    """Remove every session of a user, so a deleted or inactive account cannot refresh."""
    await db_client.delete_filtered_documents("sessions", {"user_id": user_id})
