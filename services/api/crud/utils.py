from typing import Optional
from fastapi import HTTPException
from services.api.crud.db import MongoDBClient
from services.api.schemas import convert_to_objectid
from services.api.schemas.annotations import Annotation
from services.api.schemas.projects import Project
from services.api.schemas.samples import Sample
from services.api.schemas.models import Model
from bson.objectid import ObjectId

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
    end: Optional[int] = None,
) -> list[Annotation]:
    project_obj_id = convert_to_objectid(project_id, "samples")
    db_filters = {"project_id": project_obj_id}
    if validated is not None:
        db_filters["validated"] = validated

    annotations = await db_client.get_filtered_documents(
        collection="annotations",
        filters=db_filters,
        sort_by="timestamp",
        sort_direction=-1,
        start=start,
        limit=end - start + 1 if end is not None else 0,
    )
    return annotations


async def get_samples(
    db_client: MongoDBClient, project_id: str, start: int = 0, end: Optional[int] = None
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
        limit=end - start + 1 if end is not None else 0,
    )
    return samples

async def get_models(
    db_client: MongoDBClient, project_id: str, model_type: str = None, start: int = 0, end: Optional[int] = None
) -> list[Model]:
    # Return a list of all samples for this project and info about them
    project_obj_id = convert_to_objectid(project_id, "projects")
    filters = {"project_id": project_obj_id}
    if model_type:
        filters["type"] = model_type

    if not await db_client.get_document_by_id("projects", project_obj_id):
        raise HTTPException(status_code=404, detail="Project not found with that ID.")

    models = await db_client.get_filtered_documents(
        collection="models",
        filters=filters,
        sort_by="version",
        sort_direction=-1,
        start=start,
        limit=end - start + 1 if end is not None else 0,
    )
    return models

async def get_model(
    db_client: MongoDBClient, project_id: str, model_type: str, version: int = None
):
    # Return a list of all samples for this project and info about them
    project_obj_id = convert_to_objectid(project_id, "projects")
    filters = {"project_id": project_obj_id, "type": model_type}
    if version:
        filters["version"] = version

    if not await db_client.get_document_by_id("projects", project_obj_id):
        raise HTTPException(status_code=404, detail="Project not found with that ID.")

    models = await db_client.get_filtered_documents(
        collection="models",
        filters=filters,
        sort_by="version",
        sort_direction=-1,
    )
    if not models:
        raise HTTPException(status_code=404, detail="No models found of that version and type for this project!")

    return models[0]