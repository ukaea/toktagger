from fastapi import APIRouter, Request, HTTPException, Query, Path
from services.api.schemas.projects import ProjectIn, Project
from services.api.schemas.annotations import Annotation
from services.api.schemas.samples import Sample
from services.api.schemas import convert_to_objectid
from services.api.core.data_pool import DataPool
from services.api.core.data_loaders import DATA_LOADERS
from services.api.core.query_strategy import QUERY_STRATEGIES


router = APIRouter(prefix="/projects", tags=["Projects"])


@router.get(
    "", 
    responses={
        200: {"description": "Returns a list of available Projects."},
        }
    )
async def get_projects(
    request: Request, 
    start: int = Query(0, description="Index of the first project you want returned when sorted newest - oldest"), 
    end: int = Query(None, description="Index of the last project you want returned when sorted newest - oldest, leave blank to return all entries")
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
        limit = end - start + 1 if end is not None else 0
        )
        
    return _projects

@router.post(
    "",
    responses = {
        200: {"description": "Project has been created successfully, returning the Project's ID."},
    })
async def create_project(
    request: Request, 
    project: ProjectIn
    ):
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
        responses = {
        200: {"description": "Project has been retrieved successfully."},
        404: {"description": "Project not found with that ID."},
    })
async def get_project(
    request: Request, 
    project_id: str = Path(description="The ID of the project to return")
    ) -> Project:
    """
    Get a single project using its ID.
    -----------------------------------
    """
    # Return information about a specific project
    # Have put project_id as a string for now, but might want to use ShortUUID?
    obj_id = convert_to_objectid(project_id, "projects")
    
    project = await request.app.state.db_client.get_document_by_id(
        collection="projects", 
        object_id = obj_id
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found with that ID.")
    
    return project


@router.put(
    "/{project_id}",
    responses = {
        200: {"description": "Project has been successfully set as the active project."},
        404: {"description": "Project not found with that ID."},
    })
async def set_project(
    request: Request, 
    project_id: str = Path(description="The ID of the project to activate")
    ):
    """
    Set a project as the active project using its ID.
    --------------------------------------------------
    """
    # This is not a complete solution, but I'm going to go for this to get a MVP going
    # This endpoint is used to select which project we want to use for all subsequent API calls
    # Defines the data pool, data loader, annotator, etc etc
    # Set these in the app state so that they can be used by other endpoints
    # Obviously this makes it not scalable and will only work for one user/project at a time, and should be eventually replaced by Redis caching or something?
    # TODO ^^
    
    # Get project with that ID:
    obj_id = convert_to_objectid(project_id, "projects")

    projects = await request.app.state.db_client.get_filtered_documents(
        collection="projects", 
        filters={"_id": obj_id}
    )
    
    if len(projects) == 0:
        raise HTTPException(status_code=404, detail="Project not found with that ID.")
    
    project = Project.model_validate(projects[0])
    
    # Set some global variables in the app state
    request.app.state.project = project
    
    # Get all samples which can be considered - sort by shot ID
    samples = await request.app.state.db_client.get_filtered_documents(
        collection="samples", 
        filters={"project_id": obj_id},
        sort_by= "shot_id", 
        sort_direction= 1, 
    )
    
    # Then get all non-validated annotations for these samples, sorted by uncertainty:
    non_validated_annotations = await request.app.state.db_client.get_filtered_documents(
        collection="annotations", 
        filters={"project_id": obj_id, "validated": False},
        sort_by= "uncertainty", 
        sort_direction= 1,
    )
    validated_annotations = await request.app.state.db_client.get_filtered_documents(
        collection="annotations", 
        filters={"project_id": obj_id, "validated": True},
    )
    validated_sample_ids = [validated_annotation["sample_id"] for validated_annotation in validated_annotations]

    sample_models = [Sample.model_validate(sample) for sample in samples if sample["_id"] not in validated_sample_ids]
    annotation_models = [Annotation.model_validate(annotation) for annotation in non_validated_annotations]
    
    request.app.state.data_pool = DataPool(
        data_loader=DATA_LOADERS[project.data_loader](sample_models), 
        query_strategy=QUERY_STRATEGIES[project.query_strategy](sample_models, annotation_models)
        )
    
    # TODO: Add annotator etc based on task?
    


@router.delete(
    "/{project_id}",
    responses = {
        200: {"description": "Project has been successfully deleted."},
        404: {"description": "Project not found with that ID."},
    })
async def delete_project(
    request: Request, 
    project_id: str = Path(description="The ID of the project to delete")
    ):
    """
    Permanently delete a project.
    -----------------------------
    """
    # Delete this specific project
    obj_id = convert_to_objectid(project_id, "projects")
    
    result = await request.app.state.db_client.delete_filtered_documents(
        collection="projects", 
        filters={"_id": obj_id}
    )
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found with that ID.")
