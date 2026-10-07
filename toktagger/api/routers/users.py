from fastapi import APIRouter, Depends, HTTPException, Path, Request

from toktagger.api.auth.dependencies import (
    get_current_user,
    require_global_admin,
)
from toktagger.api.crud import utils
from toktagger.api.crud.db import MongoDBClient
from toktagger.api.schemas.users import UserOut, UserUpdate
from toktagger.api.schemas.projects import ProjectMemberOut

router = APIRouter(
    prefix="/users", tags=["Users"], dependencies=[Depends(get_current_user)]
)


@router.get("", response_model=list[UserOut])
async def list_users(
    request: Request,
    _: UserOut = Depends(require_global_admin),
) -> list[UserOut]:
    return await utils.get_all_users(request.app.state.db_client)


@router.get("/me/memberships", response_model=list[ProjectMemberOut])
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


@router.get("/{user_id}", response_model=UserOut)
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
    current_user: UserOut = Depends(require_global_admin),
) -> None:
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


@router.delete("/{user_id}")
async def delete_user(
    request: Request,
    user_id: str = Path(...),
    _: UserOut = Depends(require_global_admin),
) -> None:
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
