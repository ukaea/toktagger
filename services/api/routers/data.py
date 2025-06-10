from fastapi import APIRouter, Request, HTTPException
from services.api.schemas import convert_to_objectid
from services.api.schemas.data import Data
from services.api.schemas.samples import Sample

router = APIRouter(prefix="/projects/{project_id}/samples/{sample_id}/data", tags=["Data"])


@router.get("")
async def get_data(request: Request, project_id: str, sample_id: int) -> Data:
    # Get data, eg time trace, about the given sample required for the given project
    
    # First check that the project being queried here is the one we are set up for
    # TODO: this should be improved when moving to multi user to use some cache etc
    if request.app.state.project.id != project_id:
        raise HTTPException(status_code=409, detail="Server is not setup for this project!")
    
    # Then find that sample in the datbase
    project_obj_id = convert_to_objectid(project_id)
    sample_obj_id = convert_to_objectid(sample_id)

    samples = await request.app.state.db_client.get_filtered_documents(
        collection="samples", 
        filters={"_id": sample_obj_id, "project_id": project_obj_id}
    )
    
    if len(samples) == 0:
        raise HTTPException(status_code=404, detail="Sample not found with that ID belonging to specified Project.")
    
    sample =  samples[0]
    
    # The app state should be set to use the correct data loader for this project
    # TODO: get_sample only on image data loader for now as I experiment...
    return request.app.state.data_loader.get_sample(sample)
    
    

@router.put("")
async def add_data(project_id: str, sample_id: int, request: Request) -> Data:
    # Add some data for this sample for a given project
    # Eg, could upload a CSV of time trace data for a certain pulse via the web UI
    # Have set the request as just a Request body, because I dont (yet) know what format that needs to be
    pass


@router.delete("")
async def delete_data(project_id: str, sample_id: int, params: Sample = None) -> Data:
    # Delete data for this sample from this project
    # Not sure if we really need this, but might be nice in case you have a sample which is junk in your dataset
    # Ie the images are all black because the camera failed, etc
    # What if the same data is in use by multiple projects?
    pass
