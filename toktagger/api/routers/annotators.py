from fastapi import APIRouter, Request, HTTPException
from fastapi.params import Query
from toktagger.api.schemas.projects import Project
from toktagger.api.schemas.samples import Sample
from toktagger.api.schemas.annotators import (
    AnnotatorParamTypes,
    AnnotatorTypes,
)
from toktagger.api.crud.utils import get_project, get_sample
from toktagger.api.core.annotators import ANNOTATORS
from toktagger.api.core.data_loaders import LoaderRegistry

router = APIRouter(
    prefix="/projects/{project_id}",
    tags=["Annotators"],
)


@router.get("/annotator")
async def get_annotators(request: Request, project_id: str):
    # Dunno if this is of any use
    pass


@router.post("/samples/{sample_id}/annotator/{annotator_type}")
async def create_annotations(
    request: Request,
    project_id: str,
    sample_id: str,
    annotator_type: AnnotatorTypes,
    params: AnnotatorParamTypes,
    task_name: str = Query(
        ...,
        description="The name of the task to get annotators for",
    ),
):
    # Use the specified annotator to label this sample for this project
    # Would use the datapool to load and process the data
    # The pass it through the selected annotator within the Project to make predictions
    # Return these predictions to the user, *without* adding to the database
    # Can be passed a set of annotator params and sample params?
    db_client = request.app.state.db_client
    project: Project = await get_project(db_client, project_id)
    annotator_cls = ANNOTATORS[annotator_type]

    if not annotator_cls:
        raise HTTPException(status_code=404, detail="Specified annotator not found.")

    sample: Sample = await get_sample(db_client, project_id, sample_id)

    tasks = {task.name: task for task in project.tasks}
    task = tasks.get(task_name)
    data_loader = LoaderRegistry.get(project.data_loader.name)()
    data_item = data_loader.get_sample(
        sample,
        task.signal_names,
        project.data_loader.tmin,
        project.data_loader.tmax,
        project.data_loader.max_sample_rate,
    )

    shot_id = sample.shot_id
    annotator = annotator_cls(shot_id, params)
    annotations = annotator.predict(data_item)

    return annotations
