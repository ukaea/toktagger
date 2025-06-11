from fastapi import APIRouter, Request
from services.api.schemas.samples import Sample
from services.api.schemas.annotators import Annotator
from services.api.schemas.annotations import AnnotationIn, Annotation
from services.api.schemas import convert_to_objectid

router = APIRouter(prefix="/projects/{project_id}", tags=["Annotations"],
)

@router.get("/annotations", response_model=list[Annotation])
async def get_all_annotations(request: Request, project_id: str, range_low: int = 0, range_high: int = None, validated: bool = None) -> list[Annotation]:
    db_filters = {"project_id" : convert_to_objectid(project_id, "project")}
    if validated is not None:
        db_filters["validated"] = validated
    
    _annotations = await request.app.state.db_client.get_filtered_documents(
        collection="annotations", 
        filters=db_filters, 
        sort_by="timestamp", 
        sort_direction=-1, 
        start=range_low, 
        limit = range_high - range_low + 1 if range_high is not None else 0
        )
    
    return _annotations

@router.delete("/annotations")
async def delete_all_annotations(request: Request, project_id: str):
    # Delete annotations available for this project across all samples
    await request.app.state.db_client.delete_filtered_documents(collection="annotations", filters={"project_id": project_id})

@router.get("/annotations/next")
async def get_next_annotation(project_id: str):
    # Return the next annotation for human validation for this project
    # Should use the query strategy, which access the database to determine the next sample to annotate
    # Returns data about the annotation, and also the sample_id and any additional info required (eg camera, frame number)
    # This should then be passed in to the /data endpoint to get required data for visualisation
    pass

@router.get("/samples/{sample_id}/annotations", response_model=list[Annotation])
async def get_annotations(request: Request, project_id: str, sample_id: int, filters: dict = None, range_low: int = 0, range_high: int = None, validated: bool = None) -> list[Annotation]:
    # Return annotations available for this project and sample, if any
    # Can filter by params, eg specific camera or frame being returned (or return all annotations for this sample at once and store client side?)
    # Should return whether these are validated as a boolean
    db_filters = filters or {} 
    db_filters["project_id"] = convert_to_objectid(project_id, "project")
    db_filters["sample_id"] = convert_to_objectid(sample_id, "sample")
    if validated is not None:
        db_filters["validated"] = validated
    
    _annotations = await request.app.state.db_client.get_filtered_documents(
        collection="annotations", 
        filters=db_filters, 
        sort_by="timestamp", 
        sort_direction=-1, 
        start=range_low, 
        limit = range_high - range_low + 1 if range_high is not None else 0
        )
    
    return _annotations

@router.put("/samples/{sample_id}/annotations")
async def add_annotations(request: Request, project_id: str, sample_id: int, annotations: list[AnnotationIn]):
    # Add human annotations to this project and sample
    # Again dont know what form this data will take so have set to a Request for now
    # This data could be for one or more events per task, ie multiple ELMs or UFOs per pulse
    # This should be added into the database, with validated=True
    return await request.app.state.db_client.insert_many(collection="annotations", models=annotations, ids={"project_id": convert_to_objectid(project_id, "project"), "sample_id": convert_to_objectid(sample_id, "sample")})

    
@router.delete("/samples/{sample_id}/annotations")
async def remove_annotations(request: Request, project_id: str, sample_id: int):
    # Remove annotations for this project and sample
    # Probably dont need to be able to specify params here, don't envisage how/why the UI would allow you to remove specific annotations
    await request.app.state.db_client.delete_filtered_documents(collection="annotations", filters={"project_id": convert_to_objectid(project_id, "project"), "sample_id": convert_to_objectid(sample_id, "sample")})

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