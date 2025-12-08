from fastapi import APIRouter, Request, HTTPException
from typing import Optional
from toktagger.api.core.views import DATA_VIEWS
from toktagger.api.core.data_loaders import LoaderRegistry
from toktagger.api.crud import utils
from toktagger.api.schemas.data import DataResponseType, DataParams, DataParamTypes
from toktagger.api.schemas.views import ViewParams, ViewParamTypes


router = APIRouter(prefix="/projects/{project_id}", tags=["Data"])


@router.get("/data")
async def get_data_schema(request: Request, project_id: str) -> dict:
    """Get schema which is required for getting data in this project."""
    db_client = request.app.state.db_client

    project = await utils.get_project(db_client, project_id)
    return LoaderRegistry.get_data_schema(project.data_loader)


@router.post("/samples/{sample_id}/data", response_model=DataResponseType)
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
        data = data_loader.get_sample(sample.shot_id, sample.data)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))

    data_view = DATA_VIEWS[view.name](view)
    data = data_view(data)

    return data
