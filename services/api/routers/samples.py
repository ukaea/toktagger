from fastapi import APIRouter, Request, HTTPException
from typing import Tuple
from services.api.schemas.samples import Sample, SampleOut
from bson import ObjectId
from bson.errors import InvalidId

router = APIRouter(prefix="/projects/{project_id}/samples", tags=["Samples"])


@router.get("", response_model=list[SampleOut])
async def get_samples(request: Request, project_id: str, range_low: int = 0, range_high: int = None) -> list[SampleOut]:
    # Return a list of all samples for this project and info about them    
    _annotations = await request.app.state.db_client.get_filtered_documents(
        collection="samples", 
        filters={"project_id" : project_id}, 
        sort_by="timestamp", 
        sort_direction=-1, 
        start=range_low, 
        limit = range_high - range_low + 1 if range_high is not None else 0
        )
    
    return _annotations


@router.put("")
async def add_samples(request: Request, project_id: str, samples: list[Sample]):
    # Add samples from the range specified to the project
    # I'm assuming these will be shot/pulse numbers, hence int, but could be unique ID strings instead
    # Depends if for us a 'sample' will always be a shot/pulse, or if it could be a subset eg a single frame of video
    # Do we also want to allow a single value, or list of specific value?
    return await request.app.state.db_client.insert_many(collection="samples", models=samples, ids={"project_id": project_id})

@router.get("/{sample_id}")
async def get_sample(request: Request, project_id: str, sample_id: str) -> SampleOut:
    # Get sample with this ID
    try:
        project_obj_id = ObjectId(project_id)
    except InvalidId as e:
        raise HTTPException(status_code=400, detail="Project ID is not valid.")
    try:
        sample_obj_id = ObjectId(sample_id)
    except InvalidId as e:
        raise HTTPException(status_code=400, detail="Sample ID is not valid.")

    samples = await request.app.state.db_client.get_filtered_documents(
        collection="samples", 
        filters={"_id": sample_obj_id, "project_id": project_obj_id}
    )
    
    if len(samples) == 0:
        raise HTTPException(status_code=404, detail="Sample not found with that ID belonging to specified Project.")
    
    return samples[0]


@router.delete("/{sample_id}")
async def remove_sample(request: Request, project_id: str, sample_id: str):
    # Remove samples from the project
    # Dont envisage this actually deleting the data stored about these samples
    # But do we need a separate method for that?
    try:
        obj_id = ObjectId(sample_id)
    except InvalidId as e:
        raise HTTPException(status_code=400, detail="Sample ID is not valid.")

    result = await request.app.state.db_client.delete_filtered_documents(
        collection="projects", 
        filters={"_id": obj_id, "project_id": project_id}
    )
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sample not found with that ID for this Project.")
