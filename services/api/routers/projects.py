from fastapi import APIRouter, Request
from services.api.schemas.projects import Project, ProjectOut

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
    
    print(_projects)
    
    return _projects

@router.post("")
async def create_project(project: Project):
    # Create instance of this project class, instantiating all required classes for that task, and return its ID
    # In the future, should be able to specify eg dataloader, data type, query strategy etc
    pass


@router.get("/{project_id}")
async def get_project(request: Request, project_id: str) -> Project:
    # Return information about a specific project
    # Have put project_id as a string for now, but might want to use ShortUUID?
    pass


@router.put("/{project_id}")
async def set_project(project_id: str):
    # This is not a complete solution, but I'm going to go for this to get a MVP going
    # This endpoint is used to select which project we want to use for all subsequent API calls
    # Defines the data pool, data loader, annotator, etc etc
    # Set these in the app state so that they can be used by other endpoints
    # Obviously this makes it not scalable and will only work for one user/project at a time, and should be eventually replaced by Redis caching or something?
    
    
    
    pass


@router.delete("/{project_id}")
async def delete_project(project_id: str):
    # Delete this specific project
    pass
