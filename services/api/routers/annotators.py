from fastapi import APIRouter, Request, HTTPException
from services.api.schemas.projects import Project
from services.api.schemas.samples import Sample
from services.api.schemas.annotators import Annotator, AnnotatorTypes
from services.api.schemas.annotations import AnnotationIn, Annotation
from services.api.schemas import convert_to_objectid
from services.api.crud.utils import get_project, get_sample
from services.api.core.annotators import ANNOTATORS, ANNOTATORS_PER_TASK
from services.api.core.data_loaders import DATA_LOADERS

router = APIRouter(prefix="/projects/{project_id}", tags=["Annotations"],
)

@router.get("/annotator")
async def get_annotators(request: Request, project_id: str):
    # Dunno if this is of any use
    pass

@router.post("/samples/{sample_id}/annotator/{annotator_id}")
async def create_annotations(request: Request, project_id: str, sample_id: str, annotator_id: AnnotatorTypes, params: Annotator):
    # Use the specified annotator to label this sample for this project
    # Would use the datapool to load and process the data
    # The pass it through the selected annotator within the Project to make predictions
    # Return these predictions to the user, *without* adding to the database
    # Can be passed a set of annotator params and sample params?
    db_client = request.app.state.db_client
    project: Project = await get_project(db_client, project_id)
    annotator_cls = ANNOTATORS[annotator_id]
    if not annotator_cls:
        raise HTTPException(status_code=404, detail="No annotator found for this project type.")
    if annotator_cls not in ANNOTATORS_PER_TASK(project.task):
        raise HTTPException(status_code=409, detail=f"The selected annotator cannot be used for {project.task} labelling projects.")
    
    sample: Sample = await get_sample(db_client, sample_id)
    
    data_loader = DATA_LOADERS[project.data_loader]()
    data_item = data_loader.get_sample(sample)

    annotator = annotator_cls(params)
    annotations = annotator.predict(data_item)

    return annotations
