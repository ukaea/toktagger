from fastapi import APIRouter, Request, HTTPException, Path, Query
from services.api.crud import utils
from services.api.schemas.samples import Sample
from services.api.schemas.annotators import Annotator
from services.api.schemas.annotations import AnnotationIn, Annotation, AnnotationTypes
from services.api.schemas import convert_to_objectid

router = APIRouter(
    prefix="/projects/{project_id}",
    tags=["Annotations"],
)


@router.get(
    "/annotations",
    response_model=list[Annotation],
    responses={
        200: {"description": "Annotations for this project returned successfully."},
        404: {"description": "Project not found with that ID."},
    },
)
async def get_all_annotations(
    request: Request,
    project_id: str = Path(
        description="The ID of the project to retrieve annotations for"
    ),
    start: int = Query(
        0,
        description="Index of the first annotation you want returned when sorted newest - oldest",
    ),
    count: int = Query(
        None,
        description="The number of annotations to return, leave blank to return all entries",
    ),
    validated: bool = Query(
        None,
        description="Whether to return only validated or unvalidated annotations, leave blank for all annotations",
    ),
) -> list[Annotation]:
    """
    Retrieve all annotations for this project, subject to specified filters.
    ------------------------------------------------------------------------
    """
    db_client = request.app.state.db_client
    annotations = await utils.get_annotations(
        db_client, project_id, validated, start, count
    )
    print(annotations)
    return annotations


@router.delete(
    "/annotations",
    responses={
        200: {"description": "Annotations for this project deleted successfully."},
        404: {"description": "Project not found with that ID."},
    },
)
async def delete_all_annotations(
    request: Request,
    project_id: str = Path(
        description="The ID of the project to delete all annotations for"
    ),
):
    """
    Delete ALL annotations for the given project.
    ---------------------------------------------
    """
    # Delete annotations available for this project across all samples
    if not await request.app.state.db_client.get_document_by_id(
        "projects", convert_to_objectid(project_id, "projects")
    ):
        raise HTTPException(status_code=404, detail="Project not found with that ID.")

    await request.app.state.db_client.delete_filtered_documents(
        collection="annotations", filters={"project_id": project_id}
    )


@router.get(
    "/samples/{sample_id}/annotations",
    response_model=list[AnnotationTypes],
    responses={
        200: {"description": "Annotations for this sample retrieved successfully."},
        404: {"description": "Project or Sample not found with that ID."},
    },
)
async def get_annotations(
    request: Request,
    project_id: str = Path(description="The ID of the project to get samples from."),
    sample_id: str = Path(description="The ID of the sample to get annotations from."),
    start: int = Query(
        0,
        description="Index of the first annotation you want returned when sorted newest - oldest",
    ),
    count: int = Query(
        None,
        description="The number of annotations to return, leave blank to return all entries",
    ),
    validated: bool = Query(
        None,
        description="Whether to return only validated or unvalidated annotations, leave blank for all annotations",
    ),
) -> list[Annotation]:
    # Return annotations available for this project and sample, if any
    # Can filter by params, eg specific camera or frame being returned (or return all annotations for this sample at once and store client side?)
    # Should return whether these are validated as a boolean
    db_filters = {
        "project_id": convert_to_objectid(project_id, "projects"),
        "sample_id": convert_to_objectid(sample_id, "samples"),
    }
    if validated is not None:
        db_filters["validated"] = validated

    if not await request.app.state.db_client.get_document_by_id(
        "projects", db_filters["project_id"]
    ):
        raise HTTPException(status_code=404, detail="Project not found with that ID.")
    if not await request.app.state.db_client.get_document_by_id(
        "samples", db_filters["sample_id"]
    ):
        raise HTTPException(status_code=404, detail="Sample not found with that ID.")

    _annotations = await request.app.state.db_client.get_filtered_documents(
        collection="annotations",
        filters=db_filters,
        sort_by="_id",
        sort_direction=-1,
        start=start,
        limit=count if count is not None else 0,
    )
    print(_annotations)

    return _annotations


@router.put(
    "/samples/{sample_id}/annotations",
    responses={
        200: {"description": "Annotations for this sample retrieved successfully."},
        404: {"description": "Project or Sample not found with that ID."},
    },
)
async def add_annotations(
    request: Request,
    annotations: list[AnnotationTypes],
    project_id: str = Path(description="The ID of the project to add annotations for."),
    sample_id: str = Path(description="The ID of the sample to add annotations for."),
):
    """
    Add a list of annotations to a given sample for a specified project.
    ---------------------------------------------------------------------
    """
    # Add human annotations to this project and sample
    # Again dont know what form this data will take so have set to a Request for now
    # This data could be for one or more events per task, ie multiple ELMs or UFOs per pulse
    # This should be added into the database, with validated=True
    # Delete predictions from model, if they exist, since they are being replaced by human validated ones
    ids = {
        "project_id": convert_to_objectid(project_id, "projects"),
        "sample_id": convert_to_objectid(sample_id, "samples"),
    }

    print(annotations)
    if len(annotations) == 0:
        # Nothing to do!
        return

    if not await request.app.state.db_client.get_document_by_id(
        "projects", ids["project_id"]
    ):
        raise HTTPException(status_code=404, detail="Project not found with that ID.")
    if not await request.app.state.db_client.get_document_by_id(
        "samples", ids["sample_id"]
    ):
        raise HTTPException(status_code=404, detail="Sample not found with that ID.")

    await request.app.state.db_client.delete_filtered_documents(
        collection="annotations", filters=ids
    )
    return await request.app.state.db_client.insert_many(
        collection="annotations", models=annotations, ids=ids
    )


@router.delete(
    "/samples/{sample_id}/annotations",
    responses={
        200: {"description": "Annotations for this project deleted successfully."},
        404: {"description": "Project not found with that ID."},
    },
)
async def remove_annotations(
    request: Request,
    project_id: str = Path(description="The ID of the project to delete samples from."),
    sample_id: str = Path(
        description="The ID of the sample to delete annotations from."
    ),
):
    """
    Delete ALL annotations for a given sample from a given project.
    ---------------------------------------------------------------
    """
    # Remove annotations for this project and sample
    # Probably dont need to be able to specify params here, don't envisage how/why the UI would allow you to remove specific annotations
    ids = {
        "project_id": convert_to_objectid(project_id, "projects"),
        "sample_id": convert_to_objectid(sample_id, "samples"),
    }

    if not await request.app.state.db_client.get_document_by_id(
        "projects", ids["project_id"]
    ):
        raise HTTPException(status_code=404, detail="Project not found with that ID.")
    if not await request.app.state.db_client.get_document_by_id(
        "samples", ids["sample_id"]
    ):
        raise HTTPException(status_code=404, detail="Sample not found with that ID.")

    await request.app.state.db_client.delete_filtered_documents(
        collection="annotations", filters=ids
    )
