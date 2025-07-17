from fastapi import APIRouter, Request, HTTPException, Query, Path
from services.api.schemas.projects import ProjectIn, Project
from services.api.schemas.annotations import Annotation
from services.api.schemas.samples import Sample
from services.api.schemas import convert_to_objectid
from services.api.crud import utils
from services.api.core.data_pool import DataPool
from services.api.core.data_loaders import DATA_LOADERS
from services.api.core.query_strategy import QUERY_STRATEGIES
from services.api.crud.db import MongoDBClient


router = APIRouter(prefix="/projects", tags=["Projects"])


@router.get(
    "",
    responses={
        200: {"description": "Returns a list of available Projects."},
    },
)
async def get_projects(
    request: Request,
    start: int = Query(
        0,
        description="Index of the first project you want returned when sorted newest - oldest",
    ),
    end: int = Query(
        None,
        description="Index of the last project you want returned when sorted newest - oldest, leave blank to return all entries",
    ),
) -> list[Project]:
    """
    Get a list of all available projects.
    -------------------------------------
    """
    # Return a list of all projects and info about them
    _projects = await request.app.state.db_client.get_filtered_documents(
        collection="projects",
        sort_by="timestamp",
        sort_direction=-1,
        start=start,
        limit=end - start + 1 if end is not None else 0,
    )

    return _projects


@router.post(
    "",
    responses={
        200: {
            "description": "Project has been created successfully, returning the Project's ID."
        },
    },
)
async def create_project(request: Request, project: ProjectIn):
    """
    Create a new project.
    ---------------------
    """
    # Create instance of this project class, instantiating all required classes for that task, and return its ID
    # In the future, should be able to specify eg dataloader, data type, query strategy etc
    _id = await request.app.state.db_client.insert(collection="projects", model=project)
    return {"_id": _id}


@router.get(
    "/{project_id}",
    responses={
        200: {"description": "Project has been retrieved successfully."},
        404: {"description": "Project not found with that ID."},
    },
)
async def get_project(
    request: Request,
    project_id: str = Path(description="The ID of the project to return"),
) -> Project:
    """
    Get a single project using its ID.
    -----------------------------------
    """
    # Return information about a specific project
    # Have put project_id as a string for now, but might want to use ShortUUID?
    db_client = request.app.state.db_client
    project = await utils.get_project(db_client, project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found with that ID.")

    return project


@router.put(
    "/{project_id}",
    responses={
        200: {
            "description": "Project has been successfully set as the active project."
        },
        404: {"description": "Project not found with that ID."},
    },
)
async def set_project(
    request: Request,
    project: ProjectIn,
    project_id: str = Path(description="The ID of the project to activate"),
):
    project_id = convert_to_objectid(project_id, "projects")
    db_client: MongoDBClient = request.app.state.db_client
    result = await db_client.update("projects", project_id, project)
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Project not found with that ID.")


@router.delete(
    "/{project_id}",
    responses={
        200: {"description": "Project has been successfully deleted."},
        404: {"description": "Project not found with that ID."},
    },
)
async def delete_project(
    request: Request,
    project_id: str = Path(description="The ID of the project to delete"),
):
    """
    Permanently delete a project.
    -----------------------------
    """
    obj_id = convert_to_objectid(project_id, "projects")
    db_client: MongoDBClient = request.app.state.db_client

    # Clean up all associated samples
    await db_client.delete_filtered_documents(
        collection="samples", filters={"project_id": project_id}
    )

    # Clean up all associated annotations
    await db_client.delete_filtered_documents(
        collection="annotations", filters={"project_id": project_id}
    )

    # Delete this specific project
    result = await db_client.delete_filtered_documents(
        collection="projects", filters={"_id": obj_id}
    )

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found with that ID.")
