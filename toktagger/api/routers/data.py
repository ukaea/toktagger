import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request

from toktagger.api.auth.dependencies import (
    get_current_user,
    require_project_viewer,
)
from toktagger.api.core.data_loaders import DataLoaderError, LoaderRegistry
from toktagger.api.core.views import DATA_VIEWS
from toktagger.api.crud import utils
from toktagger.api.crud.db import MongoDBClient
from toktagger.api.schemas.data import DataParams, DataParamTypes, DataResponseType
from toktagger.api.schemas.users import UserOut
from toktagger.api.schemas.views import ViewParams, ViewParamTypes

router = APIRouter(
    prefix="/projects/{project_id}/samples/{sample_id}/data",
    tags=["Data"],
    dependencies=[Depends(get_current_user)],
)


@router.post("", response_model=DataResponseType, operation_id="get_sample_data")
async def get_data(
    request: Request,
    project_id: str,
    sample_id: str,
    current_user: UserOut = Depends(require_project_viewer),
    params: DataParamTypes | None = DataParams(),
    view: ViewParamTypes | None = ViewParams(),
) -> DataResponseType:
    """
    Get data, e.g. time trace, about the given sample required for the given
    project.

    Parameters
    ----------
    project_id : str
        The ID of the project to get data for.
    sample_id : str
        The ID of the sample to get data for.
    params : DataParamTypes | None
        Parameters for loading the sample data.
    view : ViewParamTypes | None
        View transformation to apply to the loaded data.

    current_user : UserOut
        The authenticated project member (viewer, annotator, or admin), or a
        global admin. Resolved by the server, not supplied in the request.

    Returns
    -------
    DataResponseType
        The data for the sample, e.g. time trace, profile-2d, or image.

    Notes
    -----
    This endpoint is not exposed to the MCP server, as it can add potentially
    very large datasets directly into the agent's context window - use the Python client to retrieve raw data for analysis.
    The get_samples_summary endpoint summarizes sample metadata, not signal values.
    """
    db_client: MongoDBClient = request.app.state.db_client

    project = await utils.get_project(db_client, project_id)
    sample = await utils.get_sample(db_client, project_id, sample_id)

    data_loader = LoaderRegistry.get(project.data_loader)()
    try:
        data = await asyncio.to_thread(
            data_loader.get_sample,
            sample,
            params=params,
            time_min=project.time_min,
            time_max=project.time_max,
            min_time_step=project.min_time_step,
        )
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e
    except DataLoaderError as e:
        raise HTTPException(404, str(e)) from e

    try:
        data_view = DATA_VIEWS[view.name](view)
        data = data_view(data)
    except Exception as e:
        raise HTTPException(400, str(e)) from e

    return data
