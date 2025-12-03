from fastapi import APIRouter, Request, HTTPException, Query, Path
from toktagger.api.core.query_strategy import QUERY_STRATEGIES
from toktagger.api.crud import utils
from toktagger.api.schemas.samples import SampleIn, Sample, SampleSummary
from toktagger.api.schemas import convert_to_objectid
from typing import Literal, Optional

router = APIRouter(prefix="/projects/{project_id}/samples", tags=["Samples"])


@router.get(
    "",
    response_model=list[Sample],
    responses={
        200: {"description": "Samples have been retrieved successfully."},
        404: {"description": "Project not found with that ID."},
    },
)
async def get_samples(
    request: Request,
    project_id: str = Path(description="The ID of the project to get samples for."),
    sort_by: str = Query(
        "_id",
        description="Field to sort responses by, by default '_id' (equivalent to timestamp)",
    ),
    sort_direction: Literal["ascending", "descending"] = Query(
        "descending",
        description="Direction to sort responses, by default 'descending'",
    ),
    start: int = Query(
        0,
        description="Index of the first sample you want returned when sorted by above parameter",
    ),
    count: int = Query(
        None,
        description="The number of samples to return, leave blank to return all entries",
    ),
    shot_id: int | None = Query(
        None, description="The shot ID to search for, by default None"
    ),
) -> list[Sample]:
    """
    Get the full list of samples available for this project.
    --------------------------------------------------------
    """
    db_client = request.app.state.db_client
    samples = await utils.get_samples(
        db_client, project_id, shot_id, sort_by, sort_direction, start, count
    )
    return samples


@router.post(
    "",
    responses={
        200: {
            "description": "Samples have been added successfully, and a list of their IDs has been returned."
        },
        404: {"description": "Project not found with that ID."},
    },
)
async def add_samples(
    request: Request,
    samples: list[SampleIn],
    project_id: str = Path(
        description="The project ID to associate these samples with."
    ),
):
    """
    Add a list of samples (with optional annotations) to this project.
    ------------------------------------------------------------------
    """
    # Add samples from the range specified to the project
    # I'm assuming these will be shot/pulse numbers, hence int, but could be unique ID strings instead
    # Depends if for us a 'sample' will always be a shot/pulse, or if it could be a subset eg a single frame of video
    # Do we also want to allow a single value, or list of specific value?
    project_obj_id = convert_to_objectid(project_id, "projects")
    if not await request.app.state.db_client.get_document_by_id(
        "projects", project_obj_id
    ):
        raise HTTPException(status_code=404, detail="Project not found with that ID.")

    # Insert new samples
    await request.app.state.db_client.insert_many(
        collection="samples", models=samples, ids={"project_id": project_obj_id}
    )


@router.get(
    "/next",
    response_model=Sample,
    responses={
        200: {
            "description": "The next sample to annotate has been returned, according to the project's query strategy."
        },
        204: {
            "description": "No more samples are available to annotate for this project."
        },
        409: {"description": "Server is not setup to use the selected project."},
    },
)
async def get_next_sample(
    request: Request,
    project_id: str = Path(description="The project to return the next sample from."),
    current_sample_id: Optional[str] = Query(
        None, description="The ID of the current sample being annotated."
    ),
) -> Sample:
    """
    Get the next sample to annotate for this project, according to query strategy.
    ------------------------------------------------------------------------------
    """
    # Return the next sample for human validation for this project
    # Should use the query strategy, which access the database to determine the next sample to annotate
    # This should then be passed in to the /data endpoint to get required data for visualisation
    # And the /annotation endpoint to get initial prediction (if available)
    db_client = request.app.state.db_client
    project = await utils.get_project(db_client, project_id)
    samples = await utils.get_samples(db_client, project_id)
    query_strategy = QUERY_STRATEGIES[project.query_strategy](samples)

    try:
        sample = query_strategy.get_next_sample(current_sample_id)
    except RuntimeError:
        raise HTTPException(status_code=204, detail="No more samples available!")

    return sample


@router.get(
    "/previous",
    response_model=Sample,
    responses={
        200: {
            "description": "The previous sample to annotate has been returned, according to the project's query strategy."
        },
        204: {
            "description": "No more samples are available to annotate for this project."
        },
        409: {"description": "Server is not setup to use the selected project."},
    },
)
async def get_previous_sample(
    request: Request,
    project_id: str = Path(
        description="The project to return the previous sample from."
    ),
    current_sample_id: Optional[str] = Query(
        None, description="The ID of the current sample being annotated."
    ),
) -> Sample:
    """
    Get the next sample to annotate for this project, according to query strategy.
    ------------------------------------------------------------------------------
    """
    # Return the previous sample for human validation for this project
    # Should use the query strategy, which access the database to determine the previous sample to annotate
    # This should then be passed in to the /data endpoint to get required data for visualisation
    # And the /annotation endpoint to get initial prediction (if available)
    db_client = request.app.state.db_client
    project = await utils.get_project(db_client, project_id)
    samples = await utils.get_samples(db_client, project_id)
    query_strategy = QUERY_STRATEGIES[project.query_strategy](samples)

    try:
        sample = query_strategy.get_previous_sample(current_sample_id)
    except RuntimeError:
        raise HTTPException(status_code=204, detail="No more samples available!")

    return sample


@router.get("/summary")
async def get_sample_summary(
    request: Request,
    project_id: str = Path(
        description="The ID of the project to get a summary of samples from."
    ),
) -> SampleSummary:
    """Get a summary of samples for this project.

    This includes total number of samples, min and max shot IDs, and sample data type.
    """
    db_client = request.app.state.db_client
    summary = await utils.get_sample_summary(db_client, project_id)
    return summary


@router.get(
    "/{sample_id}",
    response_model=Sample,
    responses={
        200: {"description": "Samples has been returned successfully."},
        404: {"description": "Either Project or Sample not found with specified ID."},
    },
)
async def get_sample(
    request: Request,
    project_id: str = Path(
        description="The ID of the project to retrieve a sample from."
    ),
    sample_id: str = Path(description="The ID of the sample to retrieve."),
) -> Sample:
    """
    Get the specified sample from this project.
    --------------------------------------------
    """
    db_client = request.app.state.db_client
    # Check project exists
    project = await utils.get_project(db_client, project_id)
    # Get specified sample
    sample = await utils.get_sample(db_client, project.id, sample_id)
    return sample


@router.delete(
    "/{sample_id}",
    responses={
        200: {"description": "Samples has been returned successfully."},
        404: {
            "description": "Sample not found with specified ID within selected project."
        },
    },
)
async def remove_sample(
    request: Request,
    project_id: str = Path(
        description="The ID of the project to delete a sample from."
    ),
    sample_id: str = Path(description="The ID of the sample to delete."),
):
    """
    Get the specified sample from this project.
    --------------------------------------------
    """
    # Remove samples from the project
    # Dont envisage this actually deleting the data stored about these samples
    # But do we need a separate method for that?
    db_client = request.app.state.db_client
    # Check project exists
    await utils.get_project(db_client, project_id=project_id)

    # Delete sample
    await utils.delete_samples(db_client, project_id=project_id, sample_id=sample_id)

    # Delete annotations associated with this sample
    await utils.delete_annotations(
        db_client, project_id=project_id, sample_id=sample_id
    )
