from typing import Optional
from toktagger.api.core.views import DATA_VIEWS
from toktagger.api.core.data_loaders import LoaderRegistry
from toktagger.api.crud import utils
from toktagger.api.schemas.data import (
    DataResponseType,
    DataParams,
    DataParamTypes,
    SampleSummaryTypes,
)
from toktagger.api.schemas.views import ViewParams, ViewParamTypes

from fastapi import APIRouter, HTTPException, Request
from toktagger.api.crud.db import MongoDBClient
from toktagger.api.core.data_loaders import DataLoaderError

router = APIRouter(
    prefix="/projects/{project_id}/samples/{sample_id}/data", tags=["Data"]
)


async def _get_data(
    db_client: MongoDBClient,
    project_id: str,
    sample_id: str,
    params: Optional[DataParamTypes] = DataParams(),
    view: Optional[ViewParamTypes] = ViewParams(),
) -> DataResponseType:
    project = await utils.get_project(db_client, project_id)
    sample = await utils.get_sample(db_client, project_id, sample_id)

    data_loader = LoaderRegistry.get(project.data_loader)()
    try:
        data = data_loader.get_sample(
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


@router.post("", operation_id="get_sample_data", response_model=DataResponseType)
async def get_data(
    request: Request,
    project_id: str,
    sample_id: str,
    params: Optional[DataParamTypes] = DataParams(),
    view: Optional[ViewParamTypes] = ViewParams(),
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

    Returns
    -------
    DataResponseType
        The data for the sample, e.g. time trace, profile-2d, or image.

    Notes
    -----
    This endpoint is not exposed to the MCP server, as it can add potentially
    very large datasets directly into the agent's context window - use summary
    endpoints instead.
    """
    db_client = request.app.state.db_client

    data = await _get_data(db_client, project_id, sample_id, params, view)
    return data


@router.post(
    "/summary",
    operation_id="get_sample_data_summary",
    tags=["MCP"],
    response_model=SampleSummaryTypes,
)
async def get_sample_data_summary(
    request: Request,
    project_id: str,
    sample_id: str,
    params: Optional[DataParamTypes] = DataParams(),
    view: Optional[ViewParamTypes] = ViewParams(),
) -> SampleSummaryTypes:
    """
    Get a summary of the diagnostic data for a specific sample, with optional
    view transformation (e.g. profile-2d heatmaps).

    Data formats supported are time-series, 2D profiles, and images.
    Note that this only returns a summary, not the full dataset - agents should
    use the Python client to retrieve full data for analysis if requested.

    Parameters
    ----------
    project_id : str
        The ID of the project to get a data summary for.
    sample_id : str
        The ID of the sample to get a data summary for.
    params : DataParamTypes | None
        Parameters for loading the sample data.
    view : ViewParamTypes | None
        View transformation to apply to the loaded data.

    Returns
    -------
    SampleSummaryTypes
        Summaries of sample data, containing information such as signal names,
        max/min/mean values, point counts, etc.

    Notes
    -----
    Use When:
        - You are asked what kind of data a specific sample / project contains
        - You are asked which signals are present in a sample's data
        - You are asked for max/min/number of points in the dataset for a signal
    Do Not Use When:
        - You only need sample metadata (shot_id, validation status) - use get_sample instead
        - You need to see the schema of parameters for a given data loader - use get_data_schema instead
        - You need the raw signal values (e.g. plasma current, density) for a sample to analyse - use the Python client instead
        - You want to analyse data / create annotations from built-in annotators, use create_automated_sample_annotations instead
        - You want to analyse data / create predictions from an ML model - use create_model_predictions or create_sample_model_predictions instead
    Example User Requests:
        - "What does the data in this project/sample look like?"
        - "How many signals are present in the data for this project/sample?"
        - "What is the maximum value in the plasma current in this sample?"
        - "What time span does data in this sample cover?"
        - "What is the height and width of image frames in this sample?"
        - "Are image frames in this project in colour?"
    """
    db_client = request.app.state.db_client

    data = await _get_data(db_client, project_id, sample_id, params, view)
    return data.summary()
