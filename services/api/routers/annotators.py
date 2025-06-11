from fastapi import APIRouter, Request
from services.api.schemas.samples import Sample
from services.api.schemas.annotators import Annotator
from services.api.schemas.annotations import AnnotationIn, Annotation
from services.api.schemas import convert_to_objectid

router = APIRouter(prefix="/projects/{project_id}", tags=["Annotations"],
)

@router.get("/annotator")
async def get_annotators(project_id: str):
    # Return a list of all annotators available for this project
    pass

@router.get("/samples/{sample_id}/annotator/{annotator_id}")
async def create_annotations(project_id: str, sample_id: str, annotator_id: str, annotator_params: Annotator, sample_params: Sample = None):
    # Use the specified annotator to label this sample for this project
    # Would use the datapool to load and process the data
    # The pass it through the selected annotator within the Project to make predictions
    # Return these predictions to the user, *without* adding to the database
    # Can be passed a set of annotator params and sample params?
    pass