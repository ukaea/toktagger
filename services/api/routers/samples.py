from fastapi import APIRouter, Request, HTTPException
from services.api.schemas.samples import SampleIn, Sample
from services.api.schemas.annotations import Annotation
from services.api.schemas import convert_to_objectid

router = APIRouter(prefix="/projects/{project_id}/samples", tags=["Samples"])


@router.get("", response_model=list[Sample])
async def get_samples(request: Request, project_id: str, start: int = 0, end: int = None) -> list[Sample]:
    # Return a list of all samples for this project and info about them    
    project_obj_id = convert_to_objectid(project_id, "projects")
    
    if not await request.app.state.db_client.get_document_by_id("projects", project_obj_id):
        raise HTTPException(status_code=404, detail="Project not found with that ID.")
    
    _samples = await request.app.state.db_client.get_filtered_documents(
        collection="samples", 
        filters={"project_id" : project_obj_id}, 
        sort_by="timestamp", 
        sort_direction=-1, 
        start=start, 
        limit = end - start + 1 if end is not None else 0
        )
    
    return _samples


@router.put("")
async def add_samples(request: Request, project_id: str, samples: list[SampleIn]):
    # Add samples from the range specified to the project
    # I'm assuming these will be shot/pulse numbers, hence int, but could be unique ID strings instead
    # Depends if for us a 'sample' will always be a shot/pulse, or if it could be a subset eg a single frame of video
    # Do we also want to allow a single value, or list of specific value?
    project_obj_id = convert_to_objectid(project_id, "projects")
    
    # Remove annotations (if they exist), these will be added later
    all_annotations = [sample.annotations for sample in samples]
        
    # Insert new samples
    ids = await request.app.state.db_client.insert_many(collection="samples", models=samples, ids={"project_id": project_obj_id})
    
    all_ids = [{"project_id": project_obj_id, "sample_id": convert_to_objectid(sample_id, "samples")} for sample_id in ids]
    
    annotations, annotation_ids = zip(*[
        (_ann, _id) 
        for _ann_list, _id in zip(all_annotations, all_ids) 
        if _ann_list
        for _ann in _ann_list]
        )
    
    # If there are any annotations provided, insert new annotations
    if annotations:
        await request.app.state.db_client.insert_many(collection="annotations", models=list(annotations), ids=list(annotation_ids))
     
    # If a project has been set, update data pool
    if request.app.state.project:
        # Update the query strategy with the new list of samples that can be considered
        # Get all samples which can be considered - sort by shot ID
        samples = await request.app.state.db_client.get_filtered_documents(
            collection="samples", 
            filters={"project_id": project_obj_id},
            sort_by= "shot_id", 
            sort_direction= 1, 
        )

        # Then get all non-validated annotations for these samples, sorted by uncertainty:
        non_validated_annotations = await request.app.state.db_client.get_filtered_documents(
            collection="annotations", 
            filters={"project_id": project_obj_id, "validated": False},
            sort_by= "uncertainty", 
            sort_direction= 1,
        )
        validated_annotations = await request.app.state.db_client.get_filtered_documents(
            collection="annotations", 
            filters={"project_id": project_obj_id, "validated": False},
        )
        validated_sample_ids = [validated_annotation["sample_id"] for validated_annotation in validated_annotations]
                
        # Update query strategy in the app state with these
        request.app.state.data_pool.query_strategy.samples = [Sample.model_validate(sample) for sample in samples if sample["_id"] not in validated_sample_ids]
        request.app.state.data_pool.query_strategy.annotations = [Annotation.model_validate(annotation) for annotation in non_validated_annotations]
    
    return ids

@router.get("/next", response_model=Sample)
async def get_next_sample(request: Request, project_id: str) -> Sample:
    # Return the next sample for human validation for this project
    # Should use the query strategy, which access the database to determine the next sample to annotate
    # This should then be passed in to the /data endpoint to get required data for visualisation
    # And the /annotation endpoint to get initial prediction (if available)
    if not request.app.state.project:
        raise HTTPException(status_code=400, detail="You must setup a project first!")
    try:
        sample = request.app.state.data_pool.query_strategy.get_next_sample()
    except RuntimeError as e:
        raise HTTPException(status_code=204, detail="No more samples available!")
    
    return sample

@router.get("/{sample_id}", response_model=Sample)
async def get_sample(request: Request, project_id: str, sample_id: str) -> Sample:
    # Get sample with this ID
    project_obj_id = convert_to_objectid(project_id, "projects")
    sample_obj_id = convert_to_objectid(sample_id, "samples")
    
    if not await request.app.state.db_client.get_document_by_id("projects", project_obj_id):
        raise HTTPException(status_code=404, detail="Project not found with that ID.")

    samples = await request.app.state.db_client.get_filtered_documents(
        collection="samples", 
        filters={"_id": sample_obj_id, "project_id": project_obj_id}
    )
    
    if len(samples) == 0:
        raise HTTPException(status_code=404, detail="Sample not found with that ID belonging to specified Project.")
    
    return samples[0]


@router.delete("/{sample_id}")
async def remove_sample(request: Request, project_id: str, sample_id: str):
    # Remove samples from the project
    # Dont envisage this actually deleting the data stored about these samples
    # But do we need a separate method for that?
    project_obj_id = convert_to_objectid(project_id, "projects")
    sample_obj_id = convert_to_objectid(sample_id, "samples")
    
    result = await request.app.state.db_client.delete_filtered_documents(
        collection="projects", 
        filters={"_id": sample_obj_id, "project_id": project_obj_id}
    )
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sample not found with that ID for this Project.")
