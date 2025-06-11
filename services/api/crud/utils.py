from fastapi import HTTPException
from services.api.crud.db import MongoDBClient
from services.api.schemas import convert_to_objectid
from services.api.schemas.projects import Project, ProjectOut
from services.api.schemas.samples import Sample, SampleOut


async def get_project(db_client: MongoDBClient, project_id: str) -> Project:
    obj_id = convert_to_objectid(project_id, "project")

    projects = await db_client.get_filtered_documents(
        collection="projects", filters={"_id": obj_id}
    )

    if len(projects) == 0:
        raise HTTPException(status_code=404, detail="Project not found with that ID.")

    return ProjectOut(**projects[0])


async def get_sample(db_client: MongoDBClient, sample_id: str) -> Sample:
    # Get sample with this ID
    sample_obj_id = convert_to_objectid(sample_id, "sample")

    samples = await db_client.get_filtered_documents(
        collection="samples", filters={"_id": sample_obj_id}
    )

    if len(samples) == 0:
        raise HTTPException(
            status_code=404,
            detail="Sample not found with that ID belonging to specified Project.",
        )

    return SampleOut(**samples[0])
