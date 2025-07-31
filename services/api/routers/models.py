from fastapi import APIRouter, Request, Path, Query, HTTPException
import pathlib
import os
from services.api.core.annotators import FindPeaksAnnotator
from services.api.core.data_loaders import DATA_LOADERS
from services.api.crud import utils
from services.api.schemas.annotations import TimeRegion, AnnotationTypes
from services.api.schemas.annotators import Annotator, FindPeaksParams
from services.api.schemas.models import Model, ModelType, ModelIn
from services.api.schemas.samples import Sample
from services.api.schemas import convert_to_objectid
from services.api.worker import run_training, run_inference
import random
import asyncio
from bson.objectid import ObjectId
router = APIRouter(prefix="/projects/{project_id}", tags=["Models"])


@router.get("/models")
async def get_models(
    request: Request, 
    project_id: str = Path(description="The ID of the project to get models for."),
    start: int = Query(
        0,
        description="Index of the first model you want returned when sorted by version",
    ),
    end: int = Query(
        None,
        description="Index of the last model you want returned when sorted by version, leave blank to return all entries",
    ),
) -> list[Model]:
    # Return details about models being used by this project
    # Could be eg the ID, type of model, the accuracy, the version. link to mlflow / simvue instance, etc...
    db_client = request.app.state.db_client
    models = await utils.get_models(db_client=db_client, project_id=project_id, model_type=None, start=start, end=end)
    return models

@router.get("/models/{model_type}")
async def get_model(
    request: Request, 
    project_id: str = Path(description="The ID of the project to get models for."),
    model_type: ModelType = Path(description="The type of model to return information about."),
    version: int = Query(
        None,
        description="The version of the model to return, leave blank to return the latest model.",
    ),
) -> Model:
    db_client = request.app.state.db_client
    model = await utils.get_model(db_client, project_id, model_type, version)
    return model


@router.delete("/models/{model_type}")
async def delete_models(
    request: Request,
    project_id: str = Path(description="The ID of the project to get models for."),
    model_type: ModelType = Path(description="The type of model to delete."),
    version: int = Query(
        None,
        description="The version of the model to delete, leave blank to delete all models",
    ),
    ):
    db_client = request.app.state.db_client
    project_obj_id = convert_to_objectid(project_id, "projects")
    
    if not await request.app.state.db_client.get_document_by_id(
        "projects", project_obj_id
    ):
        raise HTTPException(status_code=404, detail="Project not found with that ID.")
    
    models_to_delete = await utils.get_models(db_client, project_id, model_type)
    if version:
        models_to_delete = [model for model in models_to_delete if model["version"] != version]
    
    if not models_to_delete:
        return HTTPException(status_code=404, detail=f"Version {version} of model type {model_type} not found!")
    
    # Delete from DB
    for model in models_to_delete:
        await request.app.state.db_client.delete_filtered_documents(
            collection="models",
            filters={"_id": model['_id'], "project_id": project_obj_id},
        )
        
        # And delete file from storage
        pathlib.Path(os.environ["MODEL_STORAGE"]).joinpath(f"{model['_id']}.model").unlink()

@router.get("/models/{model_type}/train")
async def get_training_info(request: Request, project_id: str, model_type: str) -> Model:
    db_client = request.app.state.db_client
    project = await utils.get_project(db_client, project_id)
    latest_model = await utils.get_model(db_client, project_id, model_type)
    if latest_model.training_status not in ("queued", "started"):
        raise HTTPException(status_code=404, detail=f"No training in progress for {model_type}")
    return latest_model

@router.put("/models/{model_type}/train")
async def train_model(request: Request, project_id: str, model_type: ModelType):
    db_client = request.app.state.db_client
    project = await utils.get_project(db_client, project_id)
    # Check that this model type is valid for this project
    if model_type not in project.model_types:
        raise HTTPException(status_code=422, detail=f"This model type is not valid for your current project! Valid types are: {project.model_types}")
    
    # Create model
    # Try to get model for this project from database if it exists
    db_models = await utils.get_models(db_client, project_id, model_type)
    
    if len([db_model for db_model in db_models if db_model.get("training_status") in ["queued", "started"]]) > 0:
        raise HTTPException(status_code=409, detail=f"Training of {model_type} already in progress for this project!")
    
    if len(db_models) == 0:
        # This is the first time a model has been saved for this project, so version = 1
        version = 1
    else:
        version = db_models[0]["version"] + 1
    
    model = {"type": model_type, "version": version, "training_status": "queued", "accuracy": 0, "progress": 0}
    model_id = await db_client.insert(
        collection = "models",
        model = ModelIn(**model),
        ids = {"project_id": ObjectId(project.id)}
    )
    model["project_id"] = project.id
    model["id"] = model_id
    # Start task with ID of this project? How will we know whether training is running? dont want multiple trainings at once? TODO
    run_training.delay(project.model_dump(mode="python"), model)
    pass


@router.delete("/models/{model_type}/train")
async def stop_model_training(project_id: str, model_id: str):
    # Stop training of this model
    pass


@router.post("/models/{model_type}/predict")
async def predict(
    request: Request,
    project_id: str = Path(description="The ID of the project to get models for."),
    model_type: ModelType = Path(description="The type of model to use for predictions."),
    num_predictions: int = Query(
        20,
        description="The maximum number of samples to make predictions for, default is 20."
    ),
    sample_ids: list[str] = Query(
        None,
        description="A list of specific sample IDs to make predictions for, leave blank for random selection.",
        
    ),
    ):
    db_client = request.app.state.db_client
    project = await utils.get_project(db_client, project_id)
    
    if model_type not in project.model_types:
        raise HTTPException(status_code=422, detail=f"This model type is not valid for your current project! Valid types are: {project.model_types}")
    
    # Find the latest created model for this project
    model = await utils.get_model(db_client, project_id, model_type, status="completed")

    # Create predictions using the given model for this project
    # Predict on samples as specified by filters
    # Stores results in the database with validated=False
    if not sample_ids:
        # Get samples with no human annotations
        selected_samples = await utils.get_samples(db_client, project.id, annotated=False)
    else:
        selected_samples = [
            await utils.get_sample(db_client, sample_id)
            for sample_id in sample_ids
            ]
        if None in selected_samples:
            selected_samples.remove(None) # Better way to handle this if user provides non existant sample IDs?
    if len(selected_samples) == 0:
        raise HTTPException(status_code=404, detail="No samples found to perform predictions on!")
    elif num_predictions > len(selected_samples):
        samples = selected_samples
    else:
        samples = random.sample(selected_samples, num_predictions)
    # Convert ObjectID to string
    sample_objs = [Sample(**sample) for sample in samples]

    run_inference.delay(project.model_dump(mode="python"), model.model_dump(mode="python"), [sample_obj.model_dump(mode="python") for sample_obj in sample_objs])

@router.delete("/models/{model_type}/predict")
async def delete_predictions(
    request: Request,
    project_id: str = Path(description="The ID of the project to get models for."),
    model_type: ModelType = Path(description="The type of model to delete predictions from."),
    ):
    db_client = request.app.state.db_client
    # Delete predictions using the given model for this project
    # Predict on samples as specified by filters
    project = await utils.get_project(db_client, project_id)
    
    if model_type not in project.model_types:
        raise HTTPException(status_code=422, detail=f"This model type is not valid for your current project! Valid types are: {project.model_types}")
    
    result = await request.app.state.db_client.delete_filtered_documents(
        collection="annotations",
        filters={"project_id": ObjectId(project.id), "created_by": model_type},
    )

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404, detail=f"No annotations produced by {model_type} could be found for this Project."
        )

@router.post("/samples/{sample_id}/models/{model_type}/predict")
async def get_sample_predictions(
    request: Request,
    project_id: str = Path(description="The ID of the project to make model predictions for."),
    sample_id: str = Path(description="The ID of the sample to make model predictions for."),
    model_type: ModelType = Path(description="The type of model to make predictions from."),
    ) -> list[AnnotationTypes]:
    ###### this is a blocking endpoint!
    db_client = request.app.state.db_client
    project = await utils.get_project(db_client, project_id)
    
    if model_type not in project.model_types:
        raise HTTPException(status_code=422, detail=f"This model type is not valid for your current project! Valid types are: {project.model_types}")
    
    # Find the latest created model for this project
    model = await utils.get_model(db_client, project.id, model_type, status="completed")
    
    sample = await utils.get_sample(db_client, sample_id)
    
    inference = run_inference.delay(project.model_dump(mode="python"), model.model_dump(mode="python"), [sample.model_dump(mode="python")])
    
    try:
        annotations = inference.get(timeout=10) # do we want to have a timeout here? Is 10s appropriate?
    except TimeoutError():
        raise HTTPException(status_code=408, detail="Prediction request timed out!") # How should we handle this? Because the task will still complete and get added to the databse, will it be added to the UI on a refesh?
    
    return annotations[0]
    

@router.get("/models/{model_id}/evaluate")
async def evaluate(project_id: str, model_id: str):
    # Get evaluation of model by comparing model predictions to human evaluations
    # Specify samples to use via filters
    # Return overall statistics, as well as correct/incorrect for each sample ID
    pass
