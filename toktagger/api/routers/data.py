import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request

from toktagger.api.auth.dependencies import (
    get_current_user,
    require_project_viewer,
)
from toktagger.api.core.data_loaders import DataLoader, DataLoaderError, LoaderRegistry
from toktagger.api.core.views import DATA_VIEWS
from toktagger.api.crud import utils
from toktagger.api.crud.db import MongoDBClient
from toktagger.api.schemas.data import DataParams, DataParamTypes, DataResponseType
from toktagger.api.schemas.projects import Project
from toktagger.api.schemas.samples import Sample
from toktagger.api.schemas.users import UserOut
from toktagger.api.schemas.views import (
    Profile2DViewParams,
    ViewParams,
    ViewParamTypes,
)

router = APIRouter(
    prefix="/projects/{project_id}/samples/{sample_id}",
    tags=["Data"],
    dependencies=[Depends(get_current_user)],
)


async def load_view_data(
    project: Project,
    sample: Sample,
    data_loader: DataLoader,
    params: DataParamTypes,
    view: ViewParamTypes,
) -> DataResponseType:
    """Load the sample data with the data loader, then convert it with the view."""
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
        return DATA_VIEWS[view.name](view)(data)
    except Exception as e:
        raise HTTPException(400, str(e)) from e


@router.post("/data", response_model=DataResponseType)
async def get_data(
    request: Request,
    project_id: str,
    sample_id: str,
    current_user: UserOut = Depends(require_project_viewer),
    params: DataParamTypes | None = DataParams(),
    view: ViewParamTypes | None = ViewParams(),
) -> DataResponseType:
    """Get data, e.g. time trace, about the given sample required for the given project"""
    db_client: MongoDBClient = request.app.state.db_client

    project = await utils.get_project(db_client, project_id)
    sample = await utils.get_sample(db_client, project_id, sample_id)

    data_loader = LoaderRegistry.get(project.data_loader)()
    return await load_view_data(
        project, sample, data_loader, params or DataParams(), view or ViewParams()
    )


@router.post("/panels/{panel_id}/data", response_model=DataResponseType)
async def get_panel_data(
    request: Request,
    project_id: str,
    sample_id: str,
    panel_id: str,
    current_user: UserOut = Depends(require_project_viewer),
    params: DataParamTypes | None = DataParams(),
    view: ViewParamTypes | None = None,
) -> DataResponseType:
    """Get the data of one panel in the layout of a multi-panel project"""
    db_client: MongoDBClient = request.app.state.db_client

    project = await utils.get_project(db_client, project_id)
    panel = project.layout.get_panel(panel_id) if project.layout else None
    if panel is None:
        raise HTTPException(404, f"Panel '{panel_id}' not found in project layout.")

    sample = await utils.get_sample(db_client, project_id, sample_id)
    data_loader, panel_sample = utils.sample_for_panel(project, sample, panel)

    panel_view = panel.default_view()
    if view is not None and view.name == panel_view.name:
        panel_view = view
    if isinstance(panel_view, Profile2DViewParams):
        # The panel config owns the signal, the request may only change the ranges.
        panel_view = panel_view.model_copy(
            update={"signal_name": panel.signal_names()[0]}
        )

    return await load_view_data(
        project, panel_sample, data_loader, params or DataParams(), panel_view
    )
