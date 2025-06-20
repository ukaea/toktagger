from typing import Optional
from fastapi import HTTPException
from services.api.crud.db import MongoDBClient
from services.api.schemas import convert_to_objectid
from services.api.schemas.annotations import Annotation
from services.api.schemas.projects import Project
from services.api.schemas.samples import Sample


async def get_project(db_client: MongoDBClient, project_id: str) -> Project:
    obj_id = convert_to_objectid(project_id, "projects")

    projects = await db_client.get_filtered_documents(
        collection="projects", filters={"_id": obj_id}
    )

    if len(projects) == 0:
        raise HTTPException(status_code=404, detail="Project not found with that ID.")

    return Project(**projects[0])


async def get_sample(db_client: MongoDBClient, sample_id: str) -> Sample:
    # Get sample with this ID
    sample_obj_id = convert_to_objectid(sample_id, "samples")

    samples = await db_client.get_filtered_documents(
        collection="samples", filters={"_id": sample_obj_id}
    )

    if len(samples) == 0:
        raise HTTPException(
            status_code=404,
            detail="Sample not found with that ID belonging to specified Project.",
        )

    return Sample(**samples[0])


async def get_annotations(
    db_client: MongoDBClient,
    project_id: str,
    validated: Optional[bool] = None,
    start: int = 0,
    count: Optional[int] = None,
) -> list[Annotation]:
    db_filters = {"project_id": project_id}
    if validated is not None:
        db_filters["validated"] = validated

    annotations = await db_client.get_filtered_documents(
        collection="annotations",
        filters=db_filters,
        sort_by="timestamp",
        sort_direction=-1,
        start=start,
        limit=count if count is not None else 0,
    )
    return annotations


async def get_samples(
    db_client: MongoDBClient, project_id: str, start: int = 0, count: Optional[int] = None
) -> list[Sample]:
    # Return a list of all samples for this project and info about them
    project_obj_id = convert_to_objectid(project_id, "projects")

    if not await db_client.get_document_by_id("projects", project_obj_id):
        raise HTTPException(status_code=404, detail="Project not found with that ID.")

    samples = await db_client.get_filtered_documents(
        collection="samples",
        filters={"project_id": project_obj_id},
        sort_by="timestamp",
        sort_direction=-1,
        start=start,
        limit=count if count is not None else 0,
    )
    return samples
