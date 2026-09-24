from fastapi import APIRouter, Depends, HTTPException, Path, Request

from toktagger.api.auth.core import hash_password
from toktagger.api.auth.dependencies import (
    get_current_user,
    require_global_admin,
    require_password_changed,
)
from toktagger.api.crud import utils
from toktagger.api.crud.db import MongoDBClient
from toktagger.api.schemas.users import (
    UserCreate,
    UserIn,
    UserOut,
    UserUpdate,
)
from toktagger.api.schemas.projects import ProjectMemberOut

router = APIRouter(
    prefix="/users", tags=["Users"], dependencies=[Depends(get_current_user)]
)


@router.get(
    "",
    response_model=list[UserOut],
    dependencies=[Depends(require_password_changed)],
)
async def list_users(
    request: Request,
    _: UserOut = Depends(require_global_admin),
) -> list[UserOut]:
    return await utils.get_all_users(request.app.state.db_client)


@router.post("", response_model=dict, dependencies=[Depends(require_password_changed)])
async def create_user(
    request: Request,
    body: UserCreate,
    _: UserOut = Depends(require_global_admin),
) -> dict[str, str]:
    # Reserved prefixes protect the internal worker namespace and the synthetic
    # created_by values stamped on ML-model predictions (worker.py) and built-in
    # annotator suggestions (core/annotators.py), so a real user can't collide with them.
    if (
        body.username.startswith("model::")
        or body.username.startswith("annotators::")
        or body.username.startswith("__")
    ):
        raise HTTPException(status_code=422, detail="Username uses a reserved prefix")
    # The creating admin knows the password they just typed in, so the new owner
    # always has to replace it on first login.
    user = UserIn(
        username=body.username,
        hashed_password=hash_password(body.password),
        global_role=body.global_role,
        must_change_password=True,
    )
    user_id = await utils.create_user(request.app.state.db_client, user)
    return {"_id": user_id}


@router.get(
    "/me/memberships",
    response_model=list[ProjectMemberOut],
    dependencies=[Depends(require_password_changed)],
)
async def list_my_memberships(
    request: Request,
    current_user: UserOut = Depends(get_current_user),
) -> list[ProjectMemberOut]:
    """Every project membership held by the caller.

    Self-scoped, so it needs no role check. The projects list uses it to gate each
    row without issuing one `/projects/{id}/members` request per row. A global admin
    is unrestricted by membership and gets an empty list.
    """
    return await utils.get_user_memberships(
        request.app.state.db_client, current_user.id
    )


@router.get(
    "/{user_id}",
    response_model=UserOut,
    dependencies=[Depends(require_password_changed)],
)
async def get_user(
    request: Request,
    user_id: str = Path(...),
    current_user: UserOut = Depends(get_current_user),
) -> UserOut:
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
    user_id: str = Path(...),
    current_user: UserOut = Depends(get_current_user),
) -> None:
    if current_user.global_role != "admin" and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Self-edit is allowed for password (profile page), but a non-admin
    # must not be able to change global_role or is_active — even on their own
    # account. Without this, self != other-user check above lets any user
    # PUT their own record with global_role="admin" and self-promote.
    if current_user.global_role != "admin" and (
        body.global_role is not None or body.is_active is not None
    ):
        raise HTTPException(
            status_code=403,
            detail="Only an admin can change global_role or is_active",
        )

    # Clearing your own forced change without supplying a password would leave the
    # account on the password someone else handed you - the bootstrap admin on the
    # public default, in the worst case. Applies whatever your global role is, so an
    # admin cannot excuse itself; clearing it for somebody else stays allowed.
    if (
        current_user.id == user_id
        and body.must_change_password is False
        and body.password is None
    ):
        raise HTTPException(
            status_code=422,
            detail="A new password is required to clear a forced password change",
        )

    db_client: MongoDBClient = request.app.state.db_client

    # Prevent demoting or deactivating the last active admin
    if body.global_role == "user" or body.is_active is False:
        all_users = await utils.get_all_users(db_client)
        remaining_admins = [
            u
            for u in all_users
            if u.global_role == "admin" and u.is_active and u.id != user_id
        ]
        if not remaining_admins:
            raise HTTPException(
                status_code=422,
                detail="Cannot demote or deactivate the last active admin account",
            )

    await utils.update_user(db_client, user_id, body)


@router.delete("/{user_id}", dependencies=[Depends(require_password_changed)])
async def delete_user(
    request: Request,
    user_id: str = Path(...),
    _: UserOut = Depends(require_global_admin),
) -> None:
    db_client: MongoDBClient = request.app.state.db_client

    # Prevent deleting the last active admin (mirrors the demote/deactivate guard
    # in update_user — otherwise the account list becomes unmanageable).
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
