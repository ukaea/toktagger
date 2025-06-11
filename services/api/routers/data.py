from fastapi import APIRouter, Request
from services.api.core.data_loaders import DATA_LOADERS
from services.api.crud import utils
from services.api.schemas.data import Data, ImageData, MultiVariateTimeSeriesData
from services.api.schemas.samples import Sample
from typing import Union

DataResponseType = Union[Data, ImageData, MultiVariateTimeSeriesData]

router = APIRouter(
    prefix="/projects/{project_id}/samples/{sample_id}/data", tags=["Data"]
)


@router.get("", response_model=DataResponseType)
async def get_data(
    request: Request, project_id: str, sample_id: str
) -> DataResponseType:
    """Get data, e.g. time trace, about the given sample required for the given project"""
    db_client = request.app.state.db_client
    project = await utils.get_project(db_client, project_id)
    sample = await utils.get_sample(db_client, sample_id)
    data_loader = DATA_LOADERS[project.data_loader]()
    data_item = data_loader.get_sample(sample)
    return data_item


@router.put("")
async def add_data(
    project_id: str, sample_id: str, request: Request
) -> DataResponseType:
    # Add some data for this sample for a given project
    # Eg, could upload a CSV of time trace data for a certain pulse via the web UI
    # Have set the request as just a Request body, because I dont (yet) know what format that needs to be
    pass


@router.delete("")
async def delete_data(
    project_id: str, sample_id: str, params: Sample = None
) -> DataResponseType:
    # Delete data for this sample from this project
    # Not sure if we really need this, but might be nice in case you have a sample which is junk in your dataset
    # Ie the images are all black because the camera failed, etc
    # What if the same data is in use by multiple projects?
    pass
