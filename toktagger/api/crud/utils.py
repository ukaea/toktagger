from pathlib import Path
from collections import defaultdict
from typing import Optional, Literal
from fastapi import HTTPException
from pydantic import TypeAdapter
from toktagger.api.crud.db import MongoDBClient
from toktagger.api.schemas import convert_to_objectid
from toktagger.api.schemas.annotations import AnnotationOutTypes, AnnotationTypes
from toktagger.api.schemas.projects import Project, ProjectUpdate
from toktagger.api.schemas.samples import FileData, Sample, SampleSummary


async def get_projects(
    db_client: MongoDBClient,
    name: Optional[str] = None,
    sort_by: Optional[str] = "_id",
    sort_direction: Optional[Literal["ascending", "descending"]] = "descending",
    start: Optional[int] = 0,
    count: Optional[int] = None,
):
    filters = {}
    if name:
        # Search with regex, return any projects which start with the searched for string, case insensitive
        filters["name"] = {"$regex": f"{name}", "$options": "i"}

    # Return a list of all projects and info about them
    projects = await db_client.get_filtered_documents(
        collection="projects",
        filters=filters,
        sort_by=sort_by,
        sort_direction=sort_direction,
        start=start,
        limit=count if count is not None else 0,
    )

    return projects


async def get_project(db_client: MongoDBClient, project_id: str) -> Project:
    obj_id = convert_to_objectid(project_id, "projects")

    projects = await db_client.get_filtered_documents(
        collection="projects", filters={"_id": obj_id}
    )

    if len(projects) == 0:
        raise HTTPException(status_code=404, detail="Project not found with that ID.")

    return Project(**projects[0])


async def get_samples(
    db_client: MongoDBClient,
    project_id: str,
    shot_id: Optional[int] = None,
    sort_by: str = "_id",
    sort_direction: Literal["ascending", "descending"] = "descending",
    start: int = 0,
    count: Optional[int] = None,
) -> list[Sample]:
    # Return a list of all samples for this project and info about them
    project_obj_id = convert_to_objectid(project_id, "projects")

    if not await db_client.get_document_by_id("projects", project_obj_id):
        raise HTTPException(status_code=404, detail="Project not found with that ID.")

    filters = {"project_id": project_obj_id}

    if shot_id is not None:
        filters["shot_id"] = shot_id

    samples = await db_client.get_filtered_documents(
        collection="samples",
        filters=filters,
        sort_by=sort_by,
        sort_direction=sort_direction,
        start=start,
        limit=count if count is not None else 0,
    )

    samples = [TypeAdapter(Sample).validate_python(s) for s in samples]
    return samples


async def update_project(
    db_client: MongoDBClient, project_id: str, project: ProjectUpdate
) -> None:
    project_id = convert_to_objectid(project_id, "projects")

    result = await db_client.update("projects", project, project_id)
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Project not found with that ID.")


async def delete_project(db_client: MongoDBClient, project_id: str) -> None:
    project_id = convert_to_objectid(project_id, "projects")

    # Clean up all associated samples
    await db_client.delete_filtered_documents(
        collection="samples", filters={"project_id": project_id}
    )

    # Clean up all associated annotations
    await db_client.delete_filtered_documents(
        collection="annotations", filters={"project_id": project_id}
    )

    # Delete this specific project
    result = await db_client.delete_filtered_documents(
        collection="projects", filters={"_id": project_id}
    )

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found with that ID.")


async def get_sample(
    db_client: MongoDBClient, project_id: str, sample_id: str
) -> Sample:
    # Convert project ID to ObhectID
    project_obj_id = convert_to_objectid(project_id, "projects")

    # Get sample with this ID
    sample_obj_id = convert_to_objectid(sample_id, "samples")

    samples = await db_client.get_filtered_documents(
        collection="samples",
        filters={"_id": sample_obj_id, "project_id": project_obj_id},
    )

    if len(samples) == 0:
        raise HTTPException(
            status_code=404,
            detail="Sample not found with that ID belonging to specified Project.",
        )

    return Sample(**samples[0])


async def delete_samples(
    db_client: MongoDBClient, project_id: str, sample_id: str = None
) -> None:
    project_obj_id = convert_to_objectid(project_id, "projects")
    filters = {"project_id": project_obj_id}

    if sample_id:
        sample_obj_id = convert_to_objectid(sample_id, "samples")
        filters["_id"] = sample_obj_id

    result = await db_client.delete_filtered_documents(
        collection="samples", filters=filters
    )

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404, detail="Sample not found belonging to this Project."
        )


async def get_annotations(
    db_client: MongoDBClient,
    project_id: str,
    sample_id: Optional[str] = None,
    task_name: Optional[str] = None,
    validated: Optional[bool] = None,
    sort_by: str = "_id",
    sort_direction: Literal["ascending", "descending"] = "descending",
    start: int = 0,
    count: Optional[int] = None,
) -> list[AnnotationOutTypes]:
    db_filters = {"project_id": convert_to_objectid(project_id, "projects")}

    if sample_id:
        db_filters["sample_id"] = convert_to_objectid(sample_id, "samples")

    if task_name is not None:
        db_filters["task_name"] = task_name

    if validated is not None:
        db_filters["validated"] = validated

    annotations = await db_client.get_filtered_documents(
        collection="annotations",
        filters=db_filters,
        sort_by=sort_by,
        sort_direction=sort_direction,
        start=start,
        limit=count if count is not None else 0,
    )

    annotations = [
        TypeAdapter(AnnotationOutTypes).validate_python(a) for a in annotations
    ]
    return annotations


async def add_annotations(
    db_client,
    project_id: str,
    sample_id: str,
    annotations: list[AnnotationTypes],
) -> list[str]:
    db_ids = {
        "project_id": convert_to_objectid(project_id, "projects"),
        "sample_id": convert_to_objectid(sample_id, "samples"),
    }
    return await db_client.insert_many(
        collection="annotations", models=annotations, ids=db_ids
    )


async def delete_annotations(
    db_client: MongoDBClient,
    project_id: str,
    sample_id: str = None,
    task_name: str = None,
    annotation_id: str = None,
) -> None:
    project_obj_id = convert_to_objectid(project_id, "projects")
    filters = {"project_id": project_obj_id}

    if sample_id:
        sample_obj_id = convert_to_objectid(sample_id, "samples")
        filters["sample_id"] = sample_obj_id

    if task_name is not None:
        filters["task_name"] = task_name

    if annotation_id:
        annotation_obj_id = convert_to_objectid(annotation_id, "annotations")
        filters["_id"] = annotation_obj_id

    result = await db_client.delete_filtered_documents(
        collection="annotations", filters=filters
    )

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Annotations not found belonging to this Sample and/or Project.",
        )


async def get_files(dir_path: str, file_type: str) -> list[str]:
    file_names = Path(dir_path).glob(f"*.{file_type}")
    file_names = map(str, file_names)
    file_names = list(sorted(file_names))
    return file_names


async def get_sample_summary(
    db_client: MongoDBClient, project_id: str
) -> SampleSummary:
    samples = await get_samples(db_client, project_id)

    summary = SampleSummary(
        total=len(samples),
        shot_min=min(sample.shot_id for sample in samples) if samples else None,
        shot_max=max(sample.shot_id for sample in samples) if samples else None,
        data=samples[0].data if samples else None,
    )

    if isinstance(summary.data, FileData):
        summary.data.file_name = str(Path(summary.data.file_name).parent)

    return summary


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
