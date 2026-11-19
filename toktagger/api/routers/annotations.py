from typing import Literal

from fastapi import APIRouter, Body, Depends, HTTPException, Path, Query, Request

from toktagger.api.auth.dependencies import (
    get_current_user,
    require_project_admin_role,
    require_project_annotator,
    require_project_viewer,
)
from toktagger.api.crud import utils
from toktagger.api.crud.db import MongoDBClient
from toktagger.api.schemas.annotations import (
    RESERVED_CREATED_BY_PREFIXES,
    AnnotationBatchTypeAdapter,
    AnnotationBatchTypes,
    AnnotationOutTypeAdapter,
    AnnotationOutTypes,
    AnnotationTypes,
)
from toktagger.api.schemas.samples import SampleUpdate
from toktagger.api.schemas.users import UserOut

router = APIRouter(
    prefix="/projects/{project_id}",
    tags=["Annotations"],
    dependencies=[Depends(get_current_user)],
)


def stale_annotations_conflict(stale_ids: list[str]) -> HTTPException:
    """A 409 naming the edited annotations that no longer exist, so a client can drop them."""
    return HTTPException(
        status_code=409,
        detail={
            "message": "Annotations were deleted since this sample was loaded.",
            "stale_ids": stale_ids,
        },
    )


@router.get(
    "/annotations",
    operation_id="get_project_annotations",
    tags=["MCP"],
    response_model=list[AnnotationOutTypes],
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
        description="Index of the first annotation you want returned when sorted by above parameter",
    ),
    count: int = Query(
        None,
        description="The number of annotations to return, leave blank to return all entries",
    ),
    validated: bool = Query(
        None,
        description="Whether to return only validated or unvalidated annotations, leave blank for all annotations",
    ),
    current_user: UserOut = Depends(require_project_viewer),
) -> list[AnnotationOutTypes]:
    """
    Retrieve all annotations for a project, subject to specified filters, with
    optional sorting, pagination, and filtering by validation status.

    Parameters
    ----------
    project_id : str
        The ID of the project to retrieve annotations for.
    sort_by : str
        Field to sort responses by, by default '_id' (equivalent to timestamp).
    sort_direction : Literal["ascending", "descending"]
        Direction to sort responses, by default 'descending'.
    start : int
        Index of the first annotation you want returned when sorted by the
        above parameter.
    count : int | None
        The number of annotations to return, leave blank to return all entries.
    validated : bool | None
        Whether to return only validated or unvalidated annotations, leave
        blank for all annotations.

    current_user : UserOut
        The authenticated project member (viewer, annotator, or admin), or a
        global admin. Resolved by the server, not supplied in the request.

    Returns
    -------
    list[AnnotationOutTypes]
        A list of Annotation objects relating to the requested project.

    Notes
    -----
    Results respect the caller's show_others_annotations membership preference.
    When false, only their own annotations are returned, even if created_by
    requests another author. Responses include resolved author display names.
    Global admins without a membership see all authors.

    Use When:
        - You need to review all annotations for a project
        - You need to filter annotations by validated/unvalidated status
        - You need to sort annotations by any of their attributes, eg by uncertainty, or timestamp
    Do Not Use When:
        - You need annotations for a specific sample — use get_sample_annotations instead
        - You want to create or update annotations — use create_sample_annotations or update_sample_annotations instead
    Example User Requests:
        - "Show me all annotations for this project"
        - "Show me validated annotations for this project"
        - "Give me the ten most uncertain annotations"
    """
    db_client: MongoDBClient = request.app.state.db_client
    await utils.get_project(db_client=db_client, project_id=project_id)

    # require_project_viewer already checked access; re-fetch to read this user's
    # show_others_annotations preference (None for a non-member admin, who sees everything).
    membership = await utils.get_project_membership(
        db_client, project_id, current_user.id
    )

    created_by = None
    if membership and not membership.show_others_annotations:
        created_by = current_user.id

    annotations = await utils.get_annotations(
        db_client=db_client,
        project_id=project_id,
        validated=validated,
        created_by=created_by,
        sort_by=sort_by,
        sort_direction=sort_direction,
        start=start,
        count=count,
    )
    return await utils.add_author_names(db_client, annotations)


@router.put(
    "/annotations",
    operation_id="import_annotations",
    tags=["MCP"],
    responses={
        200: {"description": "Annotations for this project updated successfully."},
        404: {"description": "Project not found with that ID."},
        422: {"description": "Invalid annotation data provided."},
    },
)
async def import_annotations(
    request: Request,
    annotations: list[AnnotationBatchTypes],
    project_id: str = Path(
        description="The ID of the project to update annotations for"
    ),
    current_user: UserOut = Depends(require_project_annotator),
) -> None:
    """
    Update or add annotations for this project, bulk creating annotations for
    one or more samples within the project.

    Parameters
    ----------
    annotations : list[AnnotationBatchTypes]
        The annotations to create, which may span one or more samples within
        the project.
    project_id : str
        The ID of the project to update annotations for.

    current_user : UserOut
        The authenticated project annotator/admin, or a global admin.
        Resolved by the server, not supplied in the request.

    Returns
    -------
    None
        No response body on success.

    Notes
    -----
    Human authorship is assigned to the authenticated caller, including admins.
    Reserved machine-author prefixes are preserved when importing predictions.

    Use When:
        - You are importing annotations from an external source (e.g. JSON file)
        - You want to bulk-add annotations to multiple samples at once
    Do Not Use When:
        - You are adding annotations for a single sample — use update_sample_annotations instead
        - You are querying annotations — use get_project_annotations or get_sample_annotations instead
    Example User Requests:
        - "Import these annotations from this JSON file"
    """
    db_client: MongoDBClient = request.app.state.db_client
    # Every human caller — admins included — is recorded as the author of the
    # annotations they import, so authorship is always auditable. Machine authorship
    # is kept as-is, matching the sample-level save, so re-importing an export does
    # not reassign every prediction to whoever imported it.
    for annotation in annotations:
        if not (annotation.created_by or "").startswith(RESERVED_CREATED_BY_PREFIXES):
            annotation.created_by = current_user.id
    await utils.import_annotations(db_client, project_id, annotations)


@router.delete(
    "/annotations",
    operation_id="delete_all_annotations",
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
    current_user: UserOut = Depends(require_project_admin_role),
):
    """
    Delete ALL annotations for the given project.

    Parameters
    ----------
    project_id : str
        The ID of the project to delete all annotations for.

    current_user : UserOut
        The authenticated project admin, or a global admin.
        Resolved by the server, not supplied in the request.

    Returns
    -------
    None
        No response body on success.

    Notes
    -----
    This endpoint is not exposed to the MCP server.
    """
    db_client: MongoDBClient = request.app.state.db_client
    await utils.get_project(db_client=db_client, project_id=project_id)
    await utils.delete_annotations(db_client=db_client, project_id=project_id)


@router.get(
    "/samples/{sample_id}/annotations",
    operation_id="get_sample_annotations",
    tags=["MCP"],
    response_model=list[AnnotationOutTypes],
    responses={
        200: {"description": "Annotations for this sample returned successfully."},
        404: {"description": "Project or Sample not found with that ID."},
    },
)
async def get_annotations(
    request: Request,
    project_id: str = Path(description="The ID of the project to get samples from."),
    sample_id: str = Path(description="The ID of the sample to get annotations from."),
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
    created_by: str = Query(
        None,
        description="Only return annotations by this author: a user ID, or a model:: or annotators:: value.",
    ),
    current_user: UserOut = Depends(require_project_viewer),
) -> list[AnnotationOutTypes]:
    """
    Get all annotations for a specific sample within a project, with optional
    sorting, pagination, and filtering by validation status or creator.

    Parameters
    ----------
    project_id : str
        The ID of the project to get samples from.
    sample_id : str
        The ID of the sample to get annotations from.
    sort_by : str
        Field to sort responses by, by default '_id' (equivalent to timestamp).
    sort_direction : Literal["ascending", "descending"]
        Direction to sort responses, by default 'descending'.
    start : int
        Index of the first annotation you want returned when sorted newest - oldest.
    count : int | None
        The number of annotations to return, leave blank to return all entries.
    validated : bool | None
        Whether to return only validated or unvalidated annotations, leave blank
        for all annotations.
    created_by : str | None
        Filter by a user ID or a synthetic model:: / annotators:: author value;
        the membership visibility preference takes precedence.

    current_user : UserOut
        The authenticated project member (viewer, annotator, or admin), or a
        global admin. Resolved by the server, not supplied in the request.

    Returns
    -------
    list[AnnotationOutTypes]
        A list of Annotation objects for the specified sample.

    Notes
    -----
    Results respect the caller's show_others_annotations membership preference.
    When false, only their own annotations are returned, even if created_by
    requests another author. Responses include resolved author display names.
    Global admins without a membership see all authors.

    Use When:
        - You need to get annotations for a specific sample
        - You want to see what model predictions exist for a sample (filter by created_by)
        - You want to check if a sample's annotations have already been human-validated
        - You are building a sample-level annotation review UI
    Do Not Use When:
        - You need all annotations for a project — use get_project_annotations instead
        - You are creating/updating annotations — use create_sample_annotations or update_sample_annotations instead
    Example User Requests:
        - "What annotations exist for this sample?"
        - "Show me the model predictions for this sample"
    """
    db_client: MongoDBClient = request.app.state.db_client
    await utils.get_project(db_client=db_client, project_id=project_id)
    await utils.get_sample(
        db_client=db_client, project_id=project_id, sample_id=sample_id
    )

    # require_project_viewer already checked access; re-fetch to read this user's
    # show_others_annotations preference (None for a non-member admin, who sees everything).
    membership = await utils.get_project_membership(
        db_client, project_id, current_user.id
    )

    # Apply per-user annotation visibility filter
    effective_created_by = created_by
    if membership and not membership.show_others_annotations:
        # Only show the current user's own annotations
        effective_created_by = current_user.id

    annotations = await utils.get_annotations(
        db_client=db_client,
        project_id=project_id,
        sample_id=sample_id,
        validated=validated,
        created_by=effective_created_by,
        sort_by=sort_by,
        sort_direction=sort_direction,
        start=start,
        count=count,
    )
    return await utils.add_author_names(db_client, annotations)


@router.post(
    "/samples/{sample_id}/annotations",
    operation_id="create_sample_annotations",
    tags=["MCP"],
    response_model=list[str],
    responses={
        200: {"description": "New annotation IDs returned in input order."},
        404: {"description": "Project or Sample not found with that ID."},
    },
)
async def create_annotations(
    request: Request,
    annotations: list[AnnotationTypes],
    project_id: str,
    sample_id: str,
    current_user: UserOut = Depends(require_project_annotator),
) -> list[str]:
    """
    Append new annotations to a single sample without replacing existing records.

    Parameters
    ----------
    annotations : list[AnnotationTypes]
        The annotations to create, without IDs. Project, sample and shot
        identity are derived from the target sample.
    project_id : str
        The ID of the project containing the sample.
    sample_id : str
        The ID of the sample to add annotations to.
    current_user : UserOut
        The authenticated project annotator/admin, or a global admin.
        Resolved by the server, not supplied in the request.

    Returns
    -------
    list[str]
        The new annotation IDs in input order. An empty input returns an empty
        list without changing annotations or sample validation.

    Notes
    -----
    Human authorship is assigned to the authenticated caller; registered machine
    authors are preserved. Any validated addition marks the sample validated;
    unvalidated additions do not clear its existing validation flag.

    Use When:
        - You want to add new annotations to one existing sample
        - You must preserve all existing annotations, including your own
    Do Not Use When:
        - You want to edit or replace annotations — use update_sample_annotations instead
        - You want to import annotations by shot ID across samples — use import_annotations instead
        - You only want to read annotations — use get_sample_annotations instead
    Example User Requests:
        - "Add a Flat Top region from 0.2 to 0.4 seconds to this sample"
        - "Add these labels without removing the sample's existing annotations"
    """
    db_client: MongoDBClient = request.app.state.db_client
    await utils.get_project(db_client=db_client, project_id=project_id)
    sample = await utils.get_sample(
        db_client=db_client, project_id=project_id, sample_id=sample_id
    )
    if not annotations:
        return []

    stored_annotations = [
        AnnotationBatchTypeAdapter.validate_python(
            {
                **annotation.model_dump(mode="python"),
                "id": None,
                "project_id": project_id,
                "sample_id": sample_id,
                "shot_id": sample.shot_id,
                "created_by": annotation.created_by
                if utils.is_machine_author(annotation.created_by)
                else current_user.id,
            }
        )
        for annotation in annotations
    ]

    async with db_client.lock(f"annotations:{project_id}:{sample_id}"):
        annotation_ids = await utils.add_annotations(
            db_client, project_id, sample_id, stored_annotations
        )
        if any(annotation.validated for annotation in annotations):
            await utils.update_sample(
                db_client, sample_id, SampleUpdate(validated_annotations=True)
            )
    return annotation_ids


@router.put(
    "/samples/{sample_id}/annotations",
    operation_id="update_sample_annotations",
    tags=["MCP"],
    responses={
        200: {"description": "Annotations for this sample updated successfully."},
        404: {"description": "Project or Sample not found with that ID."},
        409: {"description": "An edited annotation no longer exists."},
    },
)
async def update_annotations(
    request: Request,
    annotations: list[AnnotationBatchTypes],
    project_id: str = Path(
        description="The ID of the project to update annotations for."
    ),
    sample_id: str = Path(
        description="The ID of the sample to update annotations for."
    ),
    validated: bool = Query(
        None,
        description="Whether to set sample to validated (useful if no annotations present).",
    ),
    current_user: UserOut = Depends(require_project_annotator),
) -> list[str]:
    """
    Update the list of annotations for a given sample in a specified project.

    The caller's own annotations are replaced. Existing annotations belonging
    to other users or machines are edited in place by ID, preserving authorship;
    omitting them does not delete them. New machine predictions keep their
    synthetic author and replace that author's previous set. Other new annotations
    are attributed to the caller. Confirm destructive replacements with the user.
    Use explicit DELETE endpoints to remove another author's annotations.

    Stale edits return 409 with stale_ids. The initial stale-ID check precedes
    writes, but concurrent deletion can still cause a 409 during an in-place edit.
    The sample is marked validated if validated is true or any submitted
    annotation is validated; false does not clear its existing validation flag.

    Parameters
    ----------
    annotations : list[AnnotationBatchTypes]
        The caller's replacement annotations and any in-place edits by ID.
    project_id : str
        The ID of the project to update annotations for.
    sample_id : str
        The ID of the sample to update annotations for.
    validated : bool | None
        Whether to set sample to validated (useful if no annotations present).

    current_user : UserOut
        The authenticated project annotator/admin, or a global admin.
        Resolved by the server, not supplied in the request.

    Returns
    -------
    list[str]
        The IDs of inserted and edited annotations.

    Notes
    -----
    Use When:
        - An annotator has finished reviewing a sample and wants to save their annotations
        - You want to validate or correct model predictions while preserving authorship
        - You are correcting or refining annotations for a single sample
    Do Not Use When:
        - You do not have permission to overwrite existing annotations - check with the user first
        - You only want to append annotations - use create_sample_annotations instead
        - You are only querying annotations for a sample - use get_sample_annotations instead
    Example User Requests:
        - "Save my annotations for this sample"
        - "Mark these annotations as validated with my corrections"
    """
    db_client: MongoDBClient = request.app.state.db_client

    await utils.get_project(db_client=db_client, project_id=project_id)
    sample = await utils.get_sample(
        db_client=db_client, project_id=project_id, sample_id=sample_id
    )

    # Whose an existing annotation is comes from the database, never from the body -
    # a client claiming someone else's row as its own would otherwise route it into
    # the replace step below and have it re-inserted as a second copy.
    stored_authors = await utils.get_annotation_authors(
        db_client, project_id, sample_id
    )
    owned_annotations = []
    others_annotations = []
    machine_authors: set[str] = set()
    for annotation in annotations:
        is_other_authors = (
            annotation.id is not None
            and stored_authors.get(annotation.id, annotation.created_by)
            != current_user.id
        )
        if is_other_authors:
            # The replace step below is scoped to the caller's own created_by, so
            # re-saving another author's annotation there would duplicate it under
            # the caller's name.
            others_annotations.append(annotation)
            continue

        # A just-run model prediction or annotator suggestion keeps its synthetic
        # author; otherwise the server is authoritative for identity.
        if annotation.id is None and utils.is_machine_author(annotation.created_by):
            machine_authors.add(annotation.created_by)
        else:
            annotation.created_by = current_user.id

        annotation.shot_id = sample.shot_id
        owned_annotations.append(annotation)

    # Checked before any write, so a stale client saves nothing rather than only part.
    stale_ids = [a.id for a in others_annotations if a.id not in stored_authors]
    if stale_ids:
        raise stale_annotations_conflict(stale_ids)

    edited_ids = []
    for annotation in others_annotations:
        if not await utils.update_annotation_by_id(
            db_client=db_client,
            project_id=project_id,
            sample_id=sample_id,
            annotation_id=annotation.id,
            annotation=annotation,
        ):
            raise stale_annotations_conflict([annotation.id])
        edited_ids.append(annotation.id)

    # Machine rows arrive with no id - /annotator/{type} and the predict endpoints
    # return them unsaved - so the client can never send one back for in-place edit,
    # and a delete scoped only to the caller would leave the previous save behind and
    # stack up another copy on every save. Replace them by author instead, which is
    # well defined because the prefix names the annotator or model, not a user.
    result = await utils.update_annotations(
        db_client,
        project_id,
        sample_id,
        owned_annotations,
        created_by={current_user.id, *machine_authors},
    )
    result.extend(edited_ids)

    if validated or any(annotation.validated for annotation in annotations):
        await utils.update_sample(
            db_client=db_client,
            sample_id=sample_id,
            updates=SampleUpdate(validated_annotations=True),
        )

    return result


@router.delete(
    "/samples/{sample_id}/annotations",
    operation_id="delete_sample_annotations",
    responses={
        200: {"description": "Matching annotations deleted; unknown ids are ignored."},
        404: {"description": "Project or Sample not found with that ID."},
    },
)
async def remove_annotations(
    request: Request,
    project_id: str = Path(description="The ID of the project to delete from."),
    sample_id: str = Path(
        description="The ID of the sample to delete annotations from."
    ),
    annotation_ids: list[str] | None = Body(
        None,
        description="The IDs of the annotations to delete. Omit to delete ALL annotations for the sample.",
    ),
    current_user: UserOut = Depends(require_project_annotator),
) -> int:
    """
    Delete selected annotations, or ALL annotations when the body is omitted.

    Deletion is not limited to the caller's authorship. Unknown annotation IDs
    are ignored. Confirm the scope before deleting.

    Parameters
    ----------
    project_id : str
        The ID of the project to delete samples from.
    sample_id : str
        The ID of the sample to delete annotations from.

    annotation_ids : list[str] | None
        JSON list of annotation IDs to delete; omit the body to delete all.
        An empty list deletes nothing.

    current_user : UserOut
        The authenticated project annotator/admin, or a global admin.
        Resolved by the server, not supplied in the request.

    Returns
    -------
    int
        The number of annotations deleted.

    Notes
    -----
    This endpoint is not exposed to the MCP server.
    """
    db_client: MongoDBClient = request.app.state.db_client
    await utils.get_project(db_client=db_client, project_id=project_id)
    await utils.get_sample(
        db_client=db_client, project_id=project_id, sample_id=sample_id
    )
    return await utils.delete_annotations(
        db_client=db_client,
        project_id=project_id,
        sample_id=sample_id,
        annotation_ids=annotation_ids,
    )


@router.get(
    "/samples/{sample_id}/annotations/{annotation_id}",
    operation_id="get_annotation",
    tags=["MCP"],
    response_model=AnnotationOutTypes,
    responses={
        200: {"description": "Annotation returned successfully."},
        404: {"description": "Project, Sample or Annotation not found."},
    },
)
async def get_annotation(
    request: Request,
    project_id: str,
    sample_id: str,
    annotation_id: str,
    current_user: UserOut = Depends(require_project_viewer),
) -> AnnotationOutTypes:
    """
    Retrieve one annotation by ID within its project and sample.

    Parameters
    ----------
    project_id : str
        The ID of the project containing the annotation.
    sample_id : str
        The ID of the sample containing the annotation.
    annotation_id : str
        The ID of the annotation to retrieve.
    current_user : UserOut
        The authenticated project member (viewer, annotator, or admin), or a
        global admin. Resolved by the server, not supplied in the request.

    Returns
    -------
    AnnotationOutTypes
        The concrete annotation, including resolved author information.

    Notes
    -----
    Direct ID lookups ignore show_others_annotations, which only filters lists.
    Project access is still required. Missing or out-of-scope annotations
    return 404.

    Use When:
        - You know the annotation ID and want its current stored values
        - You want to fetch an annotation after updating it
    Do Not Use When:
        - You want all annotations for a sample — use get_sample_annotations instead
        - You want to edit an annotation — use update_annotation instead
    Example User Requests:
        - "Get this annotation by its ID"
        - "Show me the saved values for the annotation I just updated"
    """
    db_client: MongoDBClient = request.app.state.db_client
    await utils.get_project(db_client, project_id)
    await utils.get_sample(db_client, project_id, sample_id)
    annotation = await utils.get_annotation(
        db_client, project_id, sample_id, annotation_id
    )
    return (await utils.add_author_names(db_client, [annotation]))[0]


@router.put(
    "/samples/{sample_id}/annotations/{annotation_id}",
    operation_id="update_annotation",
    tags=["MCP"],
    responses={
        200: {"description": "Annotation updated successfully."},
        404: {"description": "Project, Sample or Annotation not found with that ID."},
        422: {"description": "Invalid annotation data or annotation type change."},
    },
)
async def update_annotation(
    request: Request,
    annotation: AnnotationTypes,
    project_id: str,
    sample_id: str,
    annotation_id: str,
    current_user: UserOut = Depends(require_project_annotator),
) -> None:
    """
    Update one annotation by ID without replacing any other annotations.

    Parameters
    ----------
    annotation : AnnotationTypes
        The annotation's label and geometry, plus any optional fields to update.
        Its type must match the stored annotation. Omitted optional fields and
        None values are left unchanged.
    project_id : str
        The ID of the project containing the annotation.
    sample_id : str
        The ID of the sample containing the annotation.
    annotation_id : str
        The ID of the annotation to update.
    current_user : UserOut
        The authenticated project annotator/admin, or a global admin.
        Resolved by the server, not supplied in the request.

    Returns
    -------
    None
        No updated annotation is returned. Use get_annotation to fetch it.

    Notes
    -----
    Annotators may edit other authors' annotations, matching the sample save
    endpoint. Authorship, IDs, shot ID and creation timestamp are preserved.
    An update explicitly setting validated=True marks its sample validated.
    Other updates do not change the sample's existing validation flag.

    Use When:
        - You want to correct one annotation while preserving its ID and author
        - You must leave all other annotations on the sample untouched
    Do Not Use When:
        - You want to add an annotation — use create_sample_annotations instead
        - You want to change annotation type — create a new annotation instead
        - You want to save a replacement set — use update_sample_annotations instead
    Example User Requests:
        - "Change this annotation's label to Flat Top"
        - "Correct this time region to run from 0.2 to 0.4 seconds"
    """
    db_client: MongoDBClient = request.app.state.db_client
    await utils.get_project(db_client, project_id)
    await utils.get_sample(db_client, project_id, sample_id)

    async with db_client.lock(f"annotations:{project_id}:{sample_id}"):
        stored_annotation = await utils.get_annotation(
            db_client, project_id, sample_id, annotation_id
        )
        if annotation.type != stored_annotation.type:
            raise HTTPException(
                status_code=422,
                detail="Annotation type does not match stored annotation.",
            )
        updates = annotation.model_dump(
            mode="python",
            exclude_unset=True,
            exclude_none=True,
            exclude={"timestamp", "created_by"},
        )
        merged_annotation = AnnotationOutTypeAdapter.validate_python(
            {**stored_annotation.model_dump(mode="python"), **updates}
        )
        if not await utils.update_annotation_by_id(
            db_client, project_id, sample_id, annotation_id, merged_annotation
        ):
            raise HTTPException(
                status_code=404,
                detail="Annotation not found for that project and sample.",
            )
        if annotation.validated:
            await utils.update_sample(
                db_client, sample_id, SampleUpdate(validated_annotations=True)
            )


@router.delete(
    "/samples/{sample_id}/annotations/{annotation_id}",
    responses={
        200: {"description": "Annotation deleted successfully."},
        404: {"description": "Project, Sample or Annotation not found with that ID."},
    },
)
async def remove_annotation(
    request: Request,
    project_id: str = Path(description="The ID of the project to delete from."),
    sample_id: str = Path(
        description="The ID of the sample to delete an annotation from."
    ),
    annotation_id: str = Path(description="The ID of the annotation to delete."),
    current_user: UserOut = Depends(require_project_annotator),
):
    """
    Delete a single annotation, whoever created it.

    The batch save (PUT above) carries no "deleted ids" signal and its replace
    step is scoped to the caller's own annotations, so removing someone else's
    annotation -- or a model's prediction -- has to be an explicit call.

    Parameters
    ----------
    project_id : str
        The ID of the project to delete from.
    sample_id : str
        The ID of the sample to delete an annotation from.
    annotation_id : str
        The ID of the annotation to delete.
    current_user : UserOut
        The authenticated project annotator/admin, or a global admin. Resolved
        by the server, not supplied in the request.

    Returns
    -------
    None
        No response body on success.

    Notes
    -----
    This endpoint is not exposed to the MCP server.
    """
    db_client: MongoDBClient = request.app.state.db_client
    await utils.get_project(db_client=db_client, project_id=project_id)
    await utils.get_sample(
        db_client=db_client, project_id=project_id, sample_id=sample_id
    )
    deleted = await utils.delete_annotations(
        db_client=db_client,
        project_id=project_id,
        sample_id=sample_id,
        annotation_id=annotation_id,
    )
    if not deleted:
        raise HTTPException(
            status_code=404, detail="Annotation not found for that project and sample."
        )
