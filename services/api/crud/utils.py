from collections import defaultdict
from typing import Optional
from fastapi import HTTPException
from services.api.core.data_loaders import DATA_LOADERS
from services.api.core.data_pool import DataPool
from services.api.core.query_strategy import QUERY_STRATEGIES
from services.api.crud.db import MongoDBClient
from services.api.schemas import convert_to_objectid
from services.api.schemas.annotations import Annotation, AnnotationTypes
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
    end: Optional[int] = None,
) -> list[Annotation]:
    db_filters = {"project_id": convert_to_objectid(project_id, "projects")}
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
        sort_by="shot_id",
        sort_direction=-1,
        start=start,
        limit=end - start + 1 if end is not None else 0,
    )
    samples = [Sample(**sample) for sample in samples]
    return samples


async def import_annotations(
    db_client: MongoDBClient,
    project_id: str,
    annotations: list[AnnotationTypes],
) -> None:
    ids = {
        "project_id": convert_to_objectid(project_id, "projects"),
    }

    if not await db_client.get_document_by_id("projects", ids["project_id"]):
        raise HTTPException(status_code=404, detail="Project not found with that ID.")

    if len(annotations) == 0:
        return

    sample_groups = defaultdict(list)
    for annotation in annotations:
        sample_groups[annotation.sample_id].append(annotation)

    for sample_id, sample_annotations in sample_groups.items():
        sample_obj_id = convert_to_objectid(sample_id, "samples")

        if not await db_client.get_document_by_id("samples", sample_obj_id):
            raise HTTPException(
                status_code=404,
                detail=f"Sample not found with ID {sample_id} belonging to specified Project.",
            )

        ids["sample_id"] = sample_obj_id
        await db_client.insert_many(
            collection="annotations", models=sample_annotations, ids=ids
        )


async def get_data_pool(db_client: MongoDBClient, project_id: str) -> DataPool:
    project = await get_project(db_client, project_id)
    samples = await get_samples(db_client, project_id)
    annotations = await get_annotations(db_client, project_id)

    data_pool = DataPool(
        data_loader=DATA_LOADERS[project.data_loader](),
        query_strategy=QUERY_STRATEGIES[project.query_strategy](samples, annotations),
    )

    return data_pool
