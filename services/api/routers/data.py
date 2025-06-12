from fastapi import APIRouter, Request, HTTPException, Path
from services.api.schemas import convert_to_objectid
from services.api.schemas.data import Data, ImageData, TimeSeriesData, MultiVariateTimeSeriesData, SpectrogramData
from services.api.schemas.samples import Sample
from typing import Union

router = APIRouter(prefix="/projects/{project_id}/samples/{sample_id}/data", tags=["Data"])


@router.get(
    "", 
    response_model=Union[Data, ImageData, TimeSeriesData, MultiVariateTimeSeriesData, SpectrogramData],
    responses = {
        200: {"description": "Project has been retrieved successfully."},
        404: {"description": "Project not found with that ID."},
        409: {"description": "Server has not been setup to process the specified project."}
    })
async def get_data(
    request: Request, 
    project_id: str = Path(description="The ID of the project to retrieve data from."), 
    sample_id: str = Path(description="The ID of the sample to retrieve data for.")
    ) -> Union[Data, ImageData, TimeSeriesData, MultiVariateTimeSeriesData, SpectrogramData]:
    """
    Return data from the specified sample for display.
    --------------------------------------------------
    """
    # Get data, eg time trace, about the given sample required for the given project
    
    # First check that the project being queried here is the one we are set up for
    # TODO: this should be improved when moving to multi user to use some cache etc
    if not request.app.state.project: 
        raise HTTPException(status_code=409, detail="Project has not yet been setup!")
    elif request.app.state.project.id != project_id:
        raise HTTPException(status_code=409, detail="Server is not setup for this project!")
    
    # Then find that sample in the datbase
    project_obj_id = convert_to_objectid(project_id, "projects")
    sample_obj_id = convert_to_objectid(sample_id, "samples")
    
    if not await request.app.state.db_client.get_document_by_id("projects", project_obj_id):
        raise HTTPException(status_code=404, detail="Project not found with that ID.")
    if not await request.app.state.db_client.get_document_by_id("samples",sample_obj_id):
        raise HTTPException(status_code=404, detail="Sample not found with that ID.")

    samples = await request.app.state.db_client.get_filtered_documents(
        collection="samples", 
        filters={"_id": sample_obj_id, "project_id": project_obj_id}
    )
    
    if len(samples) == 0:
        raise HTTPException(status_code=404, detail="Sample not found with that ID belonging to specified Project.")
    
    sample =  Sample.model_validate(samples[0])
    
    # The app state should be set to use the correct data loader for this project
    # TODO: get_sample only on image data loader for now as I experiment...
    return request.app.state.data_pool.data_loader.get_sample(sample)
    
    

@router.put("")
async def add_data(project_id: str, sample_id: str, request: Request) -> Union[Data, ImageData]:
    """
    Endpoint not implemented
    ------------------------
    """
    # Add some data for this sample for a given project
    # Eg, could upload a CSV of time trace data for a certain pulse via the web UI
    # Have set the request as just a Request body, because I dont (yet) know what format that needs to be
    raise HTTPException(status_code=501, detail="Endpoint not implemented")


@router.delete("")
async def delete_data(project_id: str, sample_id: str, params: Sample = None) -> Union[Data, ImageData]:
    """
    Endpoint not implemented
    ------------------------
    """
    # Delete data for this sample from this project
    # Not sure if we really need this, but might be nice in case you have a sample which is junk in your dataset
    # Ie the images are all black because the camera failed, etc
    # What if the same data is in use by multiple projects?
    raise HTTPException(status_code=501, detail="Endpoint not implemented")
