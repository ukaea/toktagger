from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request

from toktagger.api.auth.dependencies import (
    get_current_user,
    get_project_membership,
    require_global_admin,
    require_project_viewer,
    require_project_admin_role,
)
from toktagger.api.core.data_loaders import LoaderRegistry
from toktagger.api.crud import utils
from toktagger.api.crud.db import MongoDBClient
from toktagger.api.schemas.projects import (
    Project,
    ProjectIn,
    ProjectMember,
    ProjectMemberOut,
    ProjectMemberCreate,
    ProjectMemberUpdate,
    ProjectUpdate,
)
from toktagger.api.schemas.users import UserOut

router = APIRouter(
    prefix="/projects",
    tags=["Projects"],
    dependencies=[Depends(get_current_user)],
)


@router.get(
    "",
    responses={200: {"description": "Returns a list of available Projects."}},
    operation_id="get_projects",
    tags=["MCP"],
)
async def get_projects(
    request: Request,
    sort_by: str = Query(
        "_id",
        description="Field to sort responses by, by default '_id' (equivalent to timestamp)",
    ),
    sort_direction: Literal["ascending", "descending"] = Query(
        "descending",
        description="Direction to sort responses, by default 'descending'",
    ),
    start: int = Query(
        0,
        description="Index of the first project you want returned when sorted by above parameter",
    ),
    count: int | None = Query(
        None,
        description="Number of projects you want returned, leave blank to return all entries",
    ),
    name: str | None = Query(
        None, description="Name of a project to search for, by default None"
    ),
    current_user: UserOut = Depends(get_current_user),
) -> list[Project]:
    """
    Get a list of projects visible to the authenticated user, with optional sorting, pagination,
    and filtering by name.

    Parameters
    ----------
    sort_by : str
        Field to sort responses by, by default '_id' (equivalent to timestamp).
    sort_direction : Literal["ascending", "descending"]
        Direction to sort responses, by default 'descending'.
    start : int
        Index of the first project you want returned when sorted by the
        above parameter.
    count : int | None
        Number of projects you want returned, leave blank to return all entries.
    name : str | None
        Name of a project to search for, by default None.

    current_user : UserOut
        The active authenticated user, resolved by the server from a browser
        session or bearer token; do not send this as a request parameter.

    Returns
    -------
    list[Project]
        A list of Project objects, each containing: name, task,
        query_strategy, data_loader, time_min, time_max, shot_labels,
        time_region_labels, time_point_labels, bounding_box_labels,
        polygon_labels, video_bounding_box_labels, model_types, _id, timestamp.

    Notes
    -----
    Non-admin users see only projects they belong to; global admins see all projects.
    Sorting, filtering, and pagination apply to the visible projects.

    Use When:
        - You need to discover what projects exist and their configurations
        - You need a project _id to use with other endpoints
        - You want to list projects for auditing or summary purposes
    Do Not Use When:
        - You need project samples - use get_samples instead
    Example User Requests:
        - "What projects are available?"
        - "Show me all projects named Disruption"
    """
    return await utils.get_user_projects(
        db_client=request.app.state.db_client,
        user_id=current_user.id,
        global_role=current_user.global_role,
        name=name,
        sort_by=sort_by,
        sort_direction=sort_direction,
        start=start,
        count=count,
    )


@router.post(
    "",
    responses={200: {"description": "Project created successfully."}},
    operation_id="create_project",
    tags=["MCP"],
)
async def create_project(
    request: Request,
    project: ProjectIn,
    current_user: UserOut = Depends(get_current_user),
):
    """
    Create a new project with specified task, data loader, query strategy,
    label sets, and optional model types.
    The user should be prompted for the required parameters in the ProjectIn
    schema.

    Parameters
    ----------
    project : ProjectIn
        The configuration for the new project to create.

    current_user : UserOut
        The active authenticated user, resolved by the server from a browser
        session or bearer token; do not send this as a request parameter.

    Returns
    -------
    dict
        A dict with _id containing the new project's unique identifier.

    Notes
    -----
    The creator is automatically added as a project admin.

    Use When:
        - You are setting up a new annotation workflow for a dataset
        - You are preparing to add samples and annotations
    Do Not Use When:
        - The project already exists and you wish to update it - use update_project instead
    Example User Requests:
        - "Create a new time-series annotation project"
        - "Set up a video project with UFO bounding box labels"
    """
    if project.data_loader not in LoaderRegistry.names():
        raise HTTPException(422, detail="Invalid data loader specified.")

    db_client: MongoDBClient = request.app.state.db_client
    project_id = await db_client.insert(collection="projects", model=project)

    # Auto-add creator as project admin
    await utils.add_project_member(db_client, project_id, current_user.id, role="admin")

    return {"_id": project_id}


@router.get(
    "/{project_id}",
    operation_id="get_project",
    responses={
        200: {"description": "Project retrieved successfully."},
        404: {"description": "Project not found with that ID."},
    },
)
async def get_project(
    request: Request,
    project_id: str = Path(description="The ID of the project to return"),
    current_user: UserOut = Depends(require_project_viewer),
) -> Project:
    """
    Get a single project using its ID.

    Parameters
    ----------
    project_id : str
        The ID of the project to return.

    current_user : UserOut
        The authenticated project member (viewer, annotator, or admin), or a
        global admin. Resolved by the server, not supplied in the request.

    Returns
    -------
    Project
        The project with the specified ID.

    Notes
    -----
    This endpoint is not exposed to the MCP server - should use get_projects
    instead.
    """
    return await utils.get_project(request.app.state.db_client, project_id)


@router.put(
    "/{project_id}",
    operation_id="update_project",
    tags=["MCP"],
    responses={
        200: {"description": "Project updated successfully."},
        404: {"description": "Project not found with that ID."},
    },
)
async def update_project(
    request: Request,
    project: ProjectUpdate,
    project_id: str = Path(description="The ID of the project to update"),
    current_user: UserOut = Depends(require_project_admin_role),
):
    """
    Update a project's information, modifying an existing project's
    configuration, including task, labels, time windows, model types, and
    other settings.

    Parameters
    ----------
    project : ProjectUpdate
        The updated configuration for the project.
    project_id : str
        The ID of the project to update.

    current_user : UserOut
        The authenticated project admin, or a global admin.
        Resolved by the server, not supplied in the request.

    Returns
    -------
    None
        No response body on success.

    Notes
    -----
    Use When:
        - You need to change a project's annotation labels after creation
        - You want to add or remove model types from a project
        - You are updating project metadata (time windows, query strategy, etc.)
    Do Not Use When:
        - You are creating a new project - use create_project instead
    Example User Requests:
        - "Update the label set for this project"
        - "Change the query strategy for this project to sequential"
    """
    await utils.update_project(request.app.state.db_client, project_id, project)


@router.delete(
    "/{project_id}",
    operation_id="delete_project",
    responses={
        200: {"description": "Project deleted successfully."},
        404: {"description": "Project not found with that ID."},
    },
)
async def delete_project(
    request: Request,
    project_id: str = Path(description="The ID of the project to delete"),
    current_user: UserOut = Depends(require_project_admin_role),
):
    """
    Permanently delete a project.

    Parameters
    ----------
    project_id : str
        The ID of the project to delete.

    current_user : UserOut
        The authenticated project admin, or a global admin.
        Resolved by the server, not supplied in the request.

    Returns
    -------
    None
        No response body on success.

    Notes
    -----
    This endpoint is not exposed to the MCP server.
    """
    db_client: MongoDBClient = request.app.state.db_client
    await utils.delete_projects(db_client=db_client, project_id=project_id)


@router.delete(
    "",
    operation_id="delete_all_projects",
    responses={
        200: {"description": "Projects have been successfully deleted."},
    },
)
async def delete_all_projects(
    request: Request,
    _: UserOut = Depends(require_global_admin),
):
    """
    Remove all projects.

    _ : UserOut
        The authenticated global admin. Resolved by the server, not
        supplied in the request.

    Returns
    -------
    None
        No response body on success.

    Notes
    -----
    This endpoint is not exposed to the MCP server.
    """
    await utils.delete_projects(db_client=request.app.state.db_client)


@router.get(
    "/{project_id}/members",
    response_model=list[ProjectMemberOut],
    operation_id="list_project_members",
    tags=["MCP"],
)
async def list_project_members(
    request: Request,
    project_id: str = Path(description="The ID of the project to get members from."),
    _: UserOut = Depends(require_project_viewer),
):
    """
    Get a list of all members of a project, with their roles and
    annotation-visibility preferences.

    Parameters
    ----------
    project_id : str
        The ID of the project to get members from.
    _ : UserOut
        The authenticated project member (viewer, annotator, or admin), or a
        global admin. Resolved by the server, not supplied in the request.

    Returns
    -------
    list[ProjectMemberOut]
        One entry per member: user ID, username, role (admin, annotator, or
        viewer), and show_others_annotations.

    Notes
    -----
    Use When:
        - You need to know who is a member of a project and in what role
        - You need to check whether a member can see other users' annotations
    Do Not Use When:
        - You need the projects the current user belongs to - use list_my_memberships instead
        - You need to know all projects which the current user belongs to - use list_my_memberships instead
        - You need to add, remove, or update members - membership changes are not exposed via MCP
    Example User Requests:
        - "Who is in this project?"
        - "What role does this user have in the project?"
    """
    return await utils.get_project_members(request.app.state.db_client, project_id)


@router.post("/{project_id}/members", response_model=dict)
async def add_project_member(
    request: Request,
    body: ProjectMemberCreate,
    project_id: str = Path(description="The ID of the project to add the member to."),
    current_user: UserOut = Depends(require_project_admin_role),
):
    """
    Add a user as a member of a project.

    Parameters
    ----------
    body : ProjectMemberCreate
        The username to add and their project role (admin, annotator, or
        viewer; default annotator).
    project_id : str
        The ID of the project to add the member to.
    current_user : UserOut
        The authenticated project admin, or a global admin. Resolved by the
        server, not supplied in the request.

    Returns
    -------
    dict
        The _id of the created membership.

    Notes
    -----
    This endpoint is not exposed to the MCP server.
    """
    db_client = request.app.state.db_client
    user = await utils.get_user_by_username(db_client, body.username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    member_id = await utils.add_project_member(
        db_client, project_id, user.id, body.role
    )
    return {"_id": member_id}


@router.put("/{project_id}/members/{user_id}")
async def update_project_member(
    request: Request,
    body: ProjectMemberUpdate,
    project_id: str = Path(
        description="The ID of the project the membership belongs to."
    ),
    user_id: str = Path(description="The ID of the member to update."),
    current_user: UserOut = Depends(get_current_user),
    membership: ProjectMember | None = Depends(get_project_membership),
):
    """
    Update a project member's role or annotation-visibility preference.

    Parameters
    ----------
    body : ProjectMemberUpdate
        The membership fields to update: role (admin, annotator, or viewer)
        and/or show_others_annotations.
    project_id : str
        The ID of the project the membership belongs to.
    user_id : str
        The ID of the member to update.
    current_user : UserOut
        The authenticated user. Resolved by the server, not supplied in the
        request.

    Returns
    -------
    None
        No response body on success.

    Notes
    -----
    Project admins may change any member; other members may update only their
    own show_others_annotations preference - changing role always needs a
    project admin or global admin.

    This endpoint is not exposed to the MCP server.
    """
    db_client = request.app.state.db_client

    # Project admins can change any member. A non-admin may edit only their own
    # membership, and then only its preferences -- `role` always needs project admin.
    # Without the `body.role` clause a viewer could PUT their own membership with
    # {"role": "admin"} and self-promote (mirrors the field-level guard in update_user).
    is_self = current_user.id == user_id
    if (not is_self or body.role is not None) and current_user.global_role != "admin":
        if membership is None or membership.role != "admin":
            raise HTTPException(status_code=403, detail="Project admin access required")

    # A global admin has no membership row on a project they never explicitly joined
    # (see auth/dependencies.get_project_membership) -- materialize one here rather
    # than 404ing when they set a real preference on it themselves.
    if is_self and current_user.global_role == "admin":
        existing = await utils.get_project_membership(db_client, project_id, user_id)
        if existing is None:
            await utils.add_project_member(db_client, project_id, user_id, role="admin")

    await utils.update_project_member(db_client, project_id, user_id, body)


@router.delete("/{project_id}/members/{user_id}")
async def remove_project_member(
    request: Request,
    project_id: str = Path(
        description="The ID of the project to remove the member from."
    ),
    user_id: str = Path(description="The ID of the member to remove."),
    current_user: UserOut = Depends(require_project_admin_role),
):
    """
    Remove a user from a project.

    Parameters
    ----------
    project_id : str
        The ID of the project to remove the member from.
    user_id : str
        The ID of the member to remove.
    current_user : UserOut
        The authenticated project admin, or a global admin. Resolved by the
        server, not supplied in the request.

    Returns
    -------
    None
        No response body on success.

    Notes
    -----
    A project admin cannot remove themselves from a project (422).

    This endpoint is not exposed to the MCP server.
    """
    if current_user.id == user_id:
        raise HTTPException(
            status_code=422, detail="You cannot remove yourself from a project"
        )
    await utils.remove_project_member(request.app.state.db_client, project_id, user_id)
