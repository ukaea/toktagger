from fastapi import APIRouter, Request, Path, Query, HTTPException
import pathlib
import os
from services.api.core.annotators import FindPeaksAnnotator
from services.api.core.data_loaders import DATA_LOADERS
from services.api.crud import utils
from services.api.schemas.annotations import TimeRegion
from services.api.schemas.annotators import Annotator, FindPeaksParams
from services.api.schemas.models import Model
from services.api.schemas.samples import Sample
from services.api.schemas import convert_to_objectid
from services.api.worker import run_training, run_inference
import random
from bson.objectid import ObjectId
router = APIRouter(prefix="/projects/{project_id}/models", tags=["Models"])


@router.get("")
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
    models = await utils.get_models(db_client, project_id, start, end)
    return models


@router.post("")
async def create_model(project_id: str, params: Model):
    # Create a new model for this project
    # Creates (but doesnt train?) a new model and stores it somewhere
    # Returns the model ID for use later
    pass


@router.get("/{model_id}")
async def get_model(project_id: str, model_id: str) -> Model:
    # Return details about this specific model
    # Could be eg the type of model, the accuracy, the version. link to mlflow / simvue instance, etc...
    pass


@router.delete("")
async def delete_models(
    request: Request,
    project_id: str = Path(description="The ID of the project to get models for."),
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
    
    models = await utils.get_models(db_client, project_id)
    
    models_to_delete = [model for model in models if model['version'] == version] if version else models
    print(models_to_delete)
    
    if not models_to_delete:
        return HTTPException(status_code=404, detail=f"Version {version} of model not found!")
    # Delete from DB
    for model in models_to_delete:
        await request.app.state.db_client.delete_filtered_documents(
            collection="models",
            filters={"_id": model['_id'], "project_id": project_obj_id},
        )
        
        # And delete file from storage
        pathlib.Path(os.environ["MODEL_STORAGE"]).joinpath(f"{model['_id']}.model").unlink()

@router.get("/train")
async def get_training_info(project_id: str, model_id: str):
    # Get current status of model training
    pass


@router.put("/train")
async def train_model(request: Request, project_id: str):
    db_client = request.app.state.db_client
    project = await utils.get_project(db_client, project_id)
    # Start task with ID of this project? How will we know whether training is running? dont want multiple trainings at once? TODO
    run_training.delay(project.model_dump(mode="python"))
    pass


@router.delete("/train")
async def stop_model_training(project_id: str, model_id: str):
    # Stop training of this model
    pass


@router.post("/predict")
async def predict(
    request: Request,
    project_id: str = Path(description="The ID of the project to get models for."),
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
    # Create predictions using the given model for this project
    # Predict on samples as specified by filters
    # Stores results in the database with validated=False
    if not sample_ids:
        # Get samples with no existing annotations
        # TODO: Would it be easier to update samples with annotated: True/False when annotations are made? Would also simplify life in training method
        annotations = await utils.get_annotations(db_client, project.id, validated=False)
        annotated_sample_ids = set([annotation["sample_id"] for annotation in annotations])
        all_samples = await utils.get_samples(db_client, project.id)
        selected_samples = [sample for sample in all_samples if sample["_id"] not in annotated_sample_ids]
    else:
        selected_samples = [
            await db_client.get_document_by_id(collection="samples", object_id=ObjectId(sample_id))
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

    run_inference.delay(project.model_dump(mode="python"), [sample_obj.model_dump(mode="python") for sample_obj in sample_objs])


@router.post("/predict/{sample_id}")
async def predict_sample(
    request: Request,
    project_id: str,
    model_id: str,
    sample_id: str,
    params: FindPeaksParams,
) -> list[TimeRegion]:
    db_client = request.app.state.db_client

    project = await utils.get_project(db_client, project_id)
    sample = await utils.get_sample(db_client, sample_id)

    data_loader = DATA_LOADERS[project.data_loader]()
    data_item = data_loader.get_sample(sample)

    tagger = FindPeaksAnnotator(params)
    annotations = tagger.predict(data_item)

    return annotations


@router.get("/{model_id}/predict")
async def get_predictions(
    request: Request, project_id: str, model_id: str, params: Annotator
):
    # Get predictions made using the given model for this project
    # Predict on samples as specified by filters
    pass


@router.delete("/{model_id}/predict")
async def delete_predictions(project_id: str, model_id: str):
    # Delete predictions using the given model for this project
    # Predict on samples as specified by filters
    pass


@router.get("/{model_id}/evaluate")
async def evaluate(project_id: str, model_id: str):
    # Get evaluation of model by comparing model predictions to human evaluations
    # Specify samples to use via filters
    # Return overall statistics, as well as correct/incorrect for each sample ID
    pass
