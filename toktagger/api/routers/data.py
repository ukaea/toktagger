from fastapi import APIRouter, Request, HTTPException
from typing import Optional
from toktagger.api.core.views import DATA_VIEWS
from toktagger.api.core.data_loaders import LoaderRegistry
from toktagger.api.crud import utils
from toktagger.api.schemas.samples import Sample
from toktagger.api.schemas.data import DataResponseType, DataParams, DataParamTypes
from toktagger.api.schemas.views import ViewParams, ViewParamTypes


router = APIRouter(
    prefix="/projects/{project_id}/samples/{sample_id}/data", tags=["Data"]
)


@router.post("", response_model=DataResponseType)
async def get_data(
    request: Request,
    project_id: str,
    sample_id: str,
    params: Optional[DataParamTypes] = DataParams(),
    view: Optional[ViewParamTypes] = ViewParams(),
) -> DataResponseType:
    """Get data, e.g. time trace, about the given sample required for the given project"""
    db_client = request.app.state.db_client

    project = await utils.get_project(db_client, project_id)
    sample = await utils.get_sample(db_client, project_id, sample_id)

    data_loader = LoaderRegistry.get(project.data_loader)(params)
    try:
        data = data_loader.get_sample(sample)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))

    data_view = DATA_VIEWS[view.name](view)
    data = data_view(data)

    return data


@router.put("")
async def add_data(
    project_id: str, sample_id: str, request: Request
) -> DataResponseType:
    """
    Endpoint not implemented
    ------------------------
    """
    # Add some data for this sample for a given project
    # Eg, could upload a CSV of time trace data for a certain pulse via the web UI
    # Have set the request as just a Request body, because I dont (yet) know what format that needs to be
    raise HTTPException(status_code=501, detail="Endpoint not implemented")


@router.delete("")
async def delete_data(
    project_id: str, sample_id: str, params: Sample = None
) -> DataResponseType:
    """
    Endpoint not implemented
    ------------------------
    """
    # Delete data for this sample from this project
    # Not sure if we really need this, but might be nice in case you have a sample which is junk in your dataset
    # Ie the images are all black because the camera failed, etc
    # What if the same data is in use by multiple projects?
    raise HTTPException(status_code=501, detail="Endpoint not implemented")
