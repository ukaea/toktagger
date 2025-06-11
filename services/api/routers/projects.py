from fastapi import APIRouter, Request, HTTPException
from services.api.schemas.projects import ProjectIn, Project
from services.api.schemas import convert_to_objectid
from services.api.core.data_pool import DataPool
from services.api.core.data_loaders import DATA_LOADERS
from services.api.core.query_strategy import QUERY_STRATEGIES


router = APIRouter(prefix="/projects", tags=["Projects"])


@router.get("")
async def get_projects(request: Request, range_low: int = 0, range_high: int = None) -> list[Project]:
    # Return a list of all projects and info about them
    _projects = await request.app.state.db_client.get_filtered_documents(
        collection="projects", 
        sort_by="timestamp", 
        sort_direction=-1, 
        start=range_low, 
        limit = range_high - range_low + 1 if range_high is not None else 0
        )
        
    return _projects

@router.post("")
async def create_project(request: Request, project: ProjectIn):
    # Create instance of this project class, instantiating all required classes for that task, and return its ID
    # In the future, should be able to specify eg dataloader, data type, query strategy etc
    _id = await request.app.state.db_client.insert(collection="projects", model=project)
    return {"_id": _id}

@router.get("/{project_id}")
async def get_project(request: Request, project_id: str) -> Project:
    # Return information about a specific project
    # Have put project_id as a string for now, but might want to use ShortUUID?
    obj_id = convert_to_objectid(project_id, "project")
    
    projects = await request.app.state.db_client.get_filtered_documents(
        collection="projects", 
        filters={"_id": obj_id}
    )
    
    if len(projects) == 0:
        raise HTTPException(status_code=404, detail="Project not found with that ID.")
    
    return projects[0]


@router.put("/{project_id}")
async def set_project(request: Request, project_id: str):
    # This is not a complete solution, but I'm going to go for this to get a MVP going
    # This endpoint is used to select which project we want to use for all subsequent API calls
    # Defines the data pool, data loader, annotator, etc etc
    # Set these in the app state so that they can be used by other endpoints
    # Obviously this makes it not scalable and will only work for one user/project at a time, and should be eventually replaced by Redis caching or something?
    # TODO ^^
    
    # Get project with that ID:
    obj_id = convert_to_objectid(project_id, "project")

    projects = await request.app.state.db_client.get_filtered_documents(
        collection="projects", 
        filters={"_id": obj_id}
    )
    
    if len(projects) == 0:
        raise HTTPException(status_code=404, detail="Project not found with that ID.")
    
    project = Project.model_validate(projects[0])
    
    # Set some global variables in the app state
    request.app.state.project = project
    
    request.app.state.data_pool = DataPool(
        data_loader=DATA_LOADERS[project.data_loader]([]), 
        query_strategy=QUERY_STRATEGIES[project.query_strategy]([], [])
        )
    
    # TODO: Add annotator etc based on task?
    


@router.delete("/{project_id}")
async def delete_project(request: Request, project_id: str):
    # Delete this specific project
    obj_id = convert_to_objectid(project_id, "project")
    
    result = await request.app.state.db_client.delete_filtered_documents(
        collection="projects", 
        filters={"_id": obj_id}
    )
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found with that ID.")
