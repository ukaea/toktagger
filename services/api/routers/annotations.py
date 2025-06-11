from fastapi import APIRouter, Request, HTTPException
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
        
    if not await request.app.state.db_client.get_document_by_id("projects", db_filters["project_id"]):
        raise HTTPException(status_code=404, detail="Project not found with that ID.")
    
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
        
    if not await request.app.state.db_client.get_document_by_id("projects", db_filters["project_id"]):
        raise HTTPException(status_code=404, detail="Project not found with that ID.")
    if not await request.app.state.db_client.get_document_by_id("samples", db_filters["sample_id"]):
        raise HTTPException(status_code=404, detail="Sample not found with that ID.")
    
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
    # Delete predictions from model, if they exist, since they are being replaced by human validated ones
    ids = {"project_id": convert_to_objectid(project_id, "project"), "sample_id": convert_to_objectid(sample_id, "sample")}
    
    if not await request.app.state.db_client.get_document_by_id("projects", ids["project_id"]):
        raise HTTPException(status_code=404, detail="Project not found with that ID.")
    if not await request.app.state.db_client.get_document_by_id("samples", ids["sample_id"]):
        raise HTTPException(status_code=404, detail="Sample not found with that ID.")
    
    request.app.state.db_client.delete_filtered_documents(collection="annotations", filters=ids)
    return await request.app.state.db_client.insert_many(collection="annotations", models=annotations, ids=ids)

    
@router.delete("/samples/{sample_id}/annotations")
async def remove_annotations(request: Request, project_id: str, sample_id: int):
    # Remove annotations for this project and sample
    # Probably dont need to be able to specify params here, don't envisage how/why the UI would allow you to remove specific annotations
    await request.app.state.db_client.delete_filtered_documents(collection="annotations", filters={"project_id": convert_to_objectid(project_id, "project"), "sample_id": convert_to_objectid(sample_id, "sample")})
