from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Request

from toktagger.api.auth import bearer_tokens, sessions
from toktagger.api.auth.dependencies import (
    get_current_user,
    require_global_admin,
    require_session_user,
)
from toktagger.api.crud import utils
from toktagger.api.crud.db import MongoDBClient
from toktagger.api.schemas import convert_to_objectid
from toktagger.api.schemas.auth import (
    BearerTokenCreate,
    BearerTokenCreated,
    BearerTokenOut,
)
from toktagger.api.schemas.users import UserOut, UserUpdate
from toktagger.api.schemas.projects import ProjectMemberOut

router = APIRouter(
    prefix="/users", tags=["Users"], dependencies=[Depends(get_current_user)]
)


@router.get("", response_model=list[UserOut], operation_id="list_users", tags=["MCP"])
async def list_users(
    request: Request,
    _: UserOut = Depends(require_global_admin),
) -> list[UserOut]:
    """
    Get a list of all user accounts on the system.

    Parameters
    ----------
    _ : UserOut
        The authenticated global admin. Resolved by the server, not supplied
        in the request.

    Returns
    -------
    list[UserOut]
        All user accounts, including their global role and active status.

    Notes
    -----
    Requires the global admin role.

    Use When:
        - You need to see all accounts on the system
        - You need to check which users are admins or still active
    Do Not Use When:
        - You need a single user's details - use get_user instead
        - You need the current user's projects - use list_my_memberships instead
    Example User Requests:
        - "List all users"
        - "Which users are admins?"
    """
    return await utils.get_all_users(request.app.state.db_client)


@router.get(
    "/me/memberships",
    response_model=list[ProjectMemberOut],
    operation_id="list_my_memberships",
    tags=["MCP"],
)
async def list_my_memberships(
    request: Request,
    current_user: UserOut = Depends(get_current_user),
) -> list[ProjectMemberOut]:
    """
    Get every project membership held by the currently authenticated user.

    Parameters
    ----------
    current_user : UserOut
        The authenticated user. Resolved by the server, not supplied in the
        request.

    Returns
    -------
    list[ProjectMemberOut]
        One entry per project the caller is a member of, including their role
        (admin, annotator, or viewer) and annotation visibility preference in
        each.

    Notes
    -----
    Self-scoped, so it needs no role check. A global admin is unrestricted by
    membership and gets an empty list.

    Use When:
        - You need to know which projects the current user belongs to
        - You need the current user's role within each of their projects
        - You need to check whether the current user can see other users' annotations in a project
    Do Not Use When:
        - You need to see who else is a member of a project - use list_project_members instead
        - You need to list all users on the system - use list_users instead
    Example User Requests:
        - "Which projects am I a member of?"
        - "What role do I have in each of my projects?"
    """
    return await utils.get_user_memberships(
        request.app.state.db_client, current_user.id
    )


@router.get("/me/tokens", response_model=list[BearerTokenOut])
async def list_my_bearer_tokens(
    request: Request,
    purpose: Literal["api", "mcp"] | None = None,
    current_user: UserOut = Depends(require_session_user),
) -> list[BearerTokenOut]:
    """
    List the bearer tokens created by the currently authenticated user.

    Parameters
    ----------
    purpose : Literal["api", "mcp"] | None
        Filter by token purpose, or omit to list both purposes.
    current_user : UserOut
        The authenticated user with an active browser session. Resolved by the
        server, not supplied in the request.

    Returns
    -------
    list[BearerTokenOut]
        The caller's bearer tokens (name, created, expiry, last used); raw token
        values are never returned.

    Notes
    -----
    Requires a browser session - bearer tokens cannot call this endpoint, so a
    leaked token cannot be used to discover or mint further tokens.

    This endpoint is not exposed to the MCP server.
    """
    return await utils.get_bearer_tokens(
        request.app.state.db_client, current_user.id, purpose=purpose
    )


@router.post("/me/tokens", response_model=BearerTokenCreated, status_code=201)
async def create_my_bearer_token(
    request: Request,
    body: BearerTokenCreate,
    current_user: UserOut = Depends(require_session_user),
) -> BearerTokenCreated:
    """
    Create a new bearer token for the currently authenticated user.

    Parameters
    ----------
    body : BearerTokenCreate
        The token's name, purpose (api by default), and lifetime in days
        (default 30, capped by the server's api_token_max_lifetime_days setting).
    current_user : UserOut
        The authenticated user with an active browser session. Resolved by the
        server, not supplied in the request.

    Returns
    -------
    BearerTokenCreated
        The created token, including its raw value, which is shown only once.

    Notes
    -----
    Requires a browser session - bearer tokens cannot call this endpoint, so a
    leaked token cannot be used to mint further tokens.

    This endpoint is not exposed to the MCP server.
    """
    return await bearer_tokens.create_bearer_token(
        request.app.state.db_client,
        current_user.id,
        body.name,
        body.expires_in_days * 24 * 60 * 60,
        purpose=body.purpose,
    )


@router.delete("/me/tokens/{token_id}", status_code=204)
async def revoke_my_bearer_token(
    request: Request,
    token_id: str = Path(description="The ID of the bearer token to revoke."),
    current_user: UserOut = Depends(require_session_user),
) -> None:
    """
    Revoke one of the currently authenticated user's bearer tokens.

    Parameters
    ----------
    token_id : str
        The ID of the bearer token to revoke.
    current_user : UserOut
        The authenticated user with an active browser session. Resolved by the
        server, not supplied in the request.

    Returns
    -------
    None
        No response body on success.

    Notes
    -----
    Requires a browser session - bearer tokens cannot call this endpoint, so a
    leaked token cannot be used to revoke other tokens.

    This endpoint is not exposed to the MCP server.
    """
    revoked = await bearer_tokens.revoke_bearer_token(
        request.app.state.db_client, current_user.id, token_id
    )
    if not revoked:
        raise HTTPException(status_code=404, detail="bearer token not found")


@router.get("/{user_id}", response_model=UserOut, operation_id="get_user", tags=["MCP"])
async def get_user(
    request: Request,
    user_id: str = Path(description="The ID of the user to retrieve."),
    current_user: UserOut = Depends(get_current_user),
) -> UserOut:
    """
    Get a single user account by ID.

    Parameters
    ----------
    user_id : str
        The ID of the user to retrieve.
    current_user : UserOut
        The authenticated user. Resolved by the server, not supplied in the
        request.

    Returns
    -------
    UserOut
        The requested user's profile, including their global role and active
        status.

    Notes
    -----
    Only the user themselves or a global admin may retrieve a profile; any
    other caller gets a 403.

    Use When:
        - You are global admin, and need details of a specific user account
        - You need details of the current user's account
        - You need to check whether the current user is an admin or still active
    Do Not Use When:
        - You need every user on the system - use list_users instead
        - You need the current user's projects - use list_my_memberships instead
    Example User Requests:
        - "Tell me about the user with ID <user_id>"
        - "Am I an admin?"
    """
    if current_user.global_role != "admin" and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    user = await utils.get_user_by_id(request.app.state.db_client, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.put("/{user_id}")
async def update_user(
    request: Request,
    body: UserUpdate,
    user_id: str = Path(description="The ID of the user to update."),
    current_user: UserOut = Depends(require_global_admin),
) -> None:
    """
    Update a user account, including deactivating it.

    Parameters
    ----------
    body : UserUpdate
        The account fields to update; setting is_active to false deactivates
        the account and ends all of its sessions.
    user_id : str
        The ID of the user to update.
    current_user : UserOut
        The authenticated global admin. Resolved by the server, not supplied
        in the request.

    Returns
    -------
    None
        No response body on success.

    Notes
    -----
    An admin cannot deactivate their own account, nor the last active admin.

    This endpoint is not exposed to the MCP server.
    """
    if current_user.id == user_id and body.is_active is False:
        raise HTTPException(
            status_code=422, detail="You cannot deactivate your own account"
        )

    db_client: MongoDBClient = request.app.state.db_client
    if body.is_active is not False:
        await utils.update_user(db_client, user_id, body)
        return

    # Held across check and write so two admins cannot deactivate each other at once.
    async with db_client.lock("users:admins"):
        all_users = await utils.get_all_users(db_client)
        remaining_admins = [
            u
            for u in all_users
            if u.global_role == "admin" and u.is_active and u.id != user_id
        ]
        if not remaining_admins:
            raise HTTPException(
                status_code=422,
                detail="Cannot deactivate the last active admin account",
            )
        await utils.update_user(db_client, user_id, body)
    target = next(u for u in all_users if u.id == user_id)
    await sessions.end_user_sessions(db_client, target.id)


@router.delete("/{user_id}")
async def delete_user(
    request: Request,
    user_id: str = Path(description="The ID of the user to delete."),
    _: UserOut = Depends(require_global_admin),
) -> None:
    """
    Delete a user account, along with all of its bearer tokens and active sessions.

    Parameters
    ----------
    user_id : str
        The ID of the user to delete.
    _ : UserOut
        The authenticated global admin. Resolved by the server, not supplied
        in the request.

    Returns
    -------
    None
        No response body on success.

    Notes
    -----
    The last active admin account cannot be deleted.

    This endpoint is not exposed to the MCP server.
    """
    db_client: MongoDBClient = request.app.state.db_client

    # Prevent deleting the last active admin, otherwise the account list becomes unmanageable.
    async with db_client.lock("users:admins"):
        all_users = await utils.get_all_users(db_client)
        target = next((u for u in all_users if u.id == user_id), None)
        if target and target.global_role == "admin" and target.is_active:
            remaining_admins = [
                u
                for u in all_users
                if u.global_role == "admin" and u.is_active and u.id != user_id
            ]
            if not remaining_admins:
                raise HTTPException(
                    status_code=422,
                    detail="Cannot delete the last active admin account",
                )

        await utils.delete_user(db_client, user_id)
        await db_client.delete_filtered_documents(
            "bearer_tokens", {"user_id": convert_to_objectid(user_id, "users")}
        )
    if target:
        await sessions.end_user_sessions(db_client, target.id)
