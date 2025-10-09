from fastapi import APIRouter, Request, Path, Query, HTTPException
from fastapi.responses import JSONResponse
import pathlib
import os
from services.api.crud import utils
from services.api.schemas.annotations import AnnotationTypes
from services.api.schemas.models import Model, ModelType, ModelIn, ModelUpdate
from services.api.schemas import convert_to_objectid
from services.api.worker import train_model, get_predictions
import random
from bson.objectid import ObjectId
import ray
import itertools

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
    models = await utils.get_models(
        db_client=db_client,
        project_id=project_id,
        model_type=None,
        start=start,
        end=end,
    )
    return models


@router.get("/models/{model_type}")
async def get_model(
    request: Request,
    project_id: str = Path(description="The ID of the project to get models for."),
    model_type: ModelType = Path(
        description="The type of model to return information about."
    ),
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
    convert_to_objectid(project_id, "projects")

    await utils.get_project(db_client, project_id)

    if version:
        models_to_delete = [
            await utils.get_model(db_client, project_id, model_type, version)
        ]
    else:
        models_to_delete = await utils.get_models(db_client, project_id, model_type)

    if not models_to_delete:
        raise HTTPException(
            status_code=404,
            detail=f"Version {version} of model type {model_type} not found!"
            if version
            else f"No models of type {model_type} found for this project!",
        )

    # Delete from DB
    for model in models_to_delete:
        await utils.delete_model(
            db_client=db_client, project_id=project_id, model_id=model.id
        )

        # And delete file from storage (if it exists - may not if the job failed)
        pathlib.Path(os.environ["MODEL_STORAGE"]).joinpath(f"{model.id}.model").unlink(
            missing_ok=True
        )


@router.get("/models/{model_type}/train")
async def get_training_info(
    request: Request, project_id: str, model_type: str
) -> Model:
    db_client = request.app.state.db_client
    await utils.get_project(db_client, project_id)
    latest_model = await utils.get_model(db_client, project_id, model_type)
    if latest_model.training_status not in ("queued", "started"):
        raise HTTPException(
            status_code=404, detail=f"No training in progress for {model_type}"
        )
    return latest_model


@router.put("/models/{model_type}/train")
async def start_model_training(
    request: Request, project_id: str, model_type: ModelType
):
    db_client = request.app.state.db_client
    task_registry = request.app.state.task_registry
    project = await utils.get_project(db_client, project_id)
    # Check that this model type is valid for this project
    if model_type not in project.model_types:
        raise HTTPException(
            status_code=422,
            detail=f"This model type is not valid for your current project! Valid types are: {project.model_types}",
        )

    # Create model
    # Try to get model for this project from database if it exists
    db_models = await utils.get_models(db_client, project_id, model_type)

    if (
        len(
            [
                db_model
                for db_model in db_models
                if db_model.training_status in ["queued", "started"]
            ]
        )
        > 0
    ):
        raise HTTPException(
            status_code=409,
            detail=f"Training of {model_type} model already in progress!",
        )

    if len(db_models) == 0:
        # This is the first time a model has been saved for this project, so version = 1
        version = 1
    else:
        version = db_models[0].version + 1

    model_in = ModelIn(
        type=model_type,
        version=version,
        training_status="queued",
        progress=0,
        score=0,
    )

    model_id = await utils.add_model(
        db_client=db_client, project_id=project.id, model=model_in
    )

    # Get annotations and samples
    annotations = await utils.get_annotations(db_client, project.id, validated=True)
    samples = await utils.get_samples(db_client, project.id, validated=True)

    # Get all validated samples and annotations for this project
    print(f"Collected {len(annotations)} annotations.")
    print(f"Collected {len(samples)} samples.")

    # Split annotations into 2D list, so annotations[idx] is a list of annotations for samples[idx]
    annotations_2d = [
        [ann for ann in group]
        for _, group in itertools.groupby(
            annotations, key=lambda annotation: annotation.sample_id
        )
    ]

    NUM_EPOCHS = 10  # TODO where to define this? User selected? In model?
    BATCH_SIZE = 32

    model = Model(**model_in.model_dump(), id=model_id, project_id=project.id)

    train_task = train_model.remote(
        model=model,
        project=project,
        samples=samples,
        annotations=annotations_2d,
        train_val_test_split=(0.7, 0.2, 0.1),
        num_epochs=NUM_EPOCHS,
        batch_size=BATCH_SIZE,
    )

    task_id = task_registry.store(train_task)
    task_registry.update_actors(model.id)

    # Associate the Celery task ID with the model in the database
    await utils.update_model(
        db_client=db_client, model_id=model_id, updates=ModelUpdate(task_id=task_id)
    )


@router.delete("/models/{model_type}/train")
async def stop_model_training(request: Request, project_id: str, model_type: ModelType):
    db_client = request.app.state.db_client
    task_registry = request.app.state.task_registry

    # Get models which are either queued or in progress
    models = await utils.get_models(
        db_client=db_client,
        project_id=project_id,
        model_type=model_type,
        status="queued",
    )
    models += await utils.get_models(
        db_client=db_client,
        project_id=project_id,
        model_type=model_type,
        status="started",
    )

    # Get the task IDs and stop them
    for model in models:
        if model.task_id:
            task = task_registry.get(model.task_id)
            if task is not None:
                ray.kill(task)
            try:
                actor = ray.get_actor(model.id)
                ray.kill(actor)
            except ValueError:
                continue

        await utils.update_model(
            db_client=db_client,
            model_id=model.id,
            updates=ModelUpdate(training_status="aborted"),
        )

    # Return list of model IDs which were stopped
    return [model.id for model in models]


@router.post("/models/{model_type}/predict")
async def predict(
    request: Request,
    project_id: str = Path(description="The ID of the project to get models for."),
    model_type: ModelType = Path(
        description="The type of model to use for predictions."
    ),
    version: int = Query(
        None, description="Version of model to use, leave blank for latest version"
    ),
    num_predictions: int = Query(
        20,
        description="The maximum number of samples to make predictions for, default is 20.",
    ),
    sample_ids: list[str] = Query(
        None,
        description="A list of specific sample IDs to make predictions for, leave blank for random selection.",
    ),
):
    db_client = request.app.state.db_client
    task_registry = request.app.state.task_registry

    project = await utils.get_project(db_client, project_id)

    if model_type not in project.model_types:
        raise HTTPException(
            status_code=422,
            detail=f"This model type is not valid for your current project! Valid types are: {project.model_types}",
        )

    # Find the latest created model for this project
    model = await utils.get_model(
        db_client, project_id, model_type, status="completed", version=version
    )
    if model.training_status != "completed":
        raise HTTPException(
            status_code=409,
            detail="Cannot make predictions using a model version which has not successfully finished training.",
        )

    # Create predictions using the given model for this project
    # Predict on samples as specified by filters
    # Stores results in the database with validated=False
    if not sample_ids:
        # Get samples with no human annotations
        selected_samples = await utils.get_samples(
            db_client, project.id, validated=False
        )
    else:
        selected_samples = [
            await utils.get_sample(db_client, project_id, sample_id)
            for sample_id in sample_ids
        ]
        if None in selected_samples:
            selected_samples.remove(
                None
            )  # Better way to handle this if user provides non existant sample IDs?
    if len(selected_samples) == 0:
        raise HTTPException(
            status_code=404, detail="No samples found to perform predictions on!"
        )
    elif num_predictions > len(selected_samples):
        samples = selected_samples
    else:
        samples = random.sample(selected_samples, num_predictions)

    BATCH_SIZE = 32  # TODO again where to define this?

    get_predictions.remote(
        project=project, model=model, samples=samples, batch_size=BATCH_SIZE
    )
    task_registry.update_actors(model.id)


@router.delete("/models/{model_type}/predict")
async def delete_predictions(
    request: Request,
    project_id: str = Path(description="The ID of the project to get models for."),
    model_type: ModelType = Path(
        description="The type of model to delete predictions from."
    ),
):
    db_client = request.app.state.db_client
    # Delete predictions using the given model for this project
    # Predict on samples as specified by filters
    project = await utils.get_project(db_client, project_id)

    if model_type not in project.model_types:
        raise HTTPException(
            status_code=422,
            detail=f"This model type is not valid for your current project! Valid types are: {project.model_types}",
        )

    result = await request.app.state.db_client.delete_filtered_documents(
        collection="annotations",
        filters={"project_id": ObjectId(project.id), "created_by": model_type},
    )

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail=f"No annotations produced by {model_type} could be found for this Project.",
        )


@router.post("/samples/{sample_id}/models/{model_type}/predict")
async def create_sample_predictions(
    request: Request,
    project_id: str = Path(
        description="The ID of the project to make model predictions for."
    ),
    sample_id: str = Path(
        description="The ID of the sample to make model predictions for."
    ),
    model_type: ModelType = Path(
        description="The type of model to make predictions from."
    ),
) -> None:
    db_client = request.app.state.db_client
    task_registry = request.app.state.task_registry

    project = await utils.get_project(db_client, project_id)

    if model_type not in project.model_types:
        raise HTTPException(
            status_code=422,
            detail=f"This model type is not valid for your current project! Valid types are: {project.model_types}",
        )

    # Find the latest created model for this project
    model = await utils.get_model(db_client, project.id, model_type, status="completed")

    sample = await utils.get_sample(db_client, project_id, sample_id)

    BATCH_SIZE = 32  # TODO again where to define this?
    task = get_predictions.remote(
        project=project, model=model, samples=[sample], batch_size=BATCH_SIZE
    )
    task_id = task_registry.store(task)
    task_registry.update_actors(model.id)

    return {"task_id": task_id}


@router.get("/samples/{sample_id}/models/{model_type}/predict/{task_id}")
async def get_sample_predictions(
    request: Request,
    project_id: str = Path(
        description="The ID of the project to get model predictions for."
    ),
    sample_id: str = Path(
        description="The ID of the sample to get model predictions for."
    ),
    model_type: ModelType = Path(
        description="The type of model to get predictions from."
    ),
    task_id: str = Path(description="The prediction task to get results from."),
) -> list[AnnotationTypes]:
    db_client = request.app.state.db_client
    task_registry = request.app.state.task_registry

    project = await utils.get_project(db_client, project_id)

    if model_type not in project.model_types:
        raise HTTPException(
            status_code=422,
            detail=f"This model type is not valid for your current project! Valid types are: {project.model_types}",
        )

    await utils.get_sample(db_client, project_id, sample_id)

    # Check whether predictions are complete
    task = task_registry.get(task_id)
    if task is None:
        raise HTTPException(
            content="Predict task not found with that ID!", status_code=404
        )

    ready, waiting = ray.wait([task], timeout=0)

    if waiting:
        return JSONResponse(
            content={"message": "Predict task in the queue!"}, status_code=202
        )
    elif ready:
        try:
            result = ray.get(task)
        except Exception:
            raise HTTPException(
                content="Predict task failed - no predictions available",
                status_code=500,
            )
        # Check project ID and model type match those expected by user
        if result["project_id"] != project_id:
            raise HTTPException(
                content="Project ID for this task does not match!", status_code=422
            )
        elif result["model_type"] != model_type:
            raise HTTPException(
                content="Model used for this task does not match!", status_code=422
            )
        elif not (annotations := result["annotations"].get(sample_id)):
            raise HTTPException(
                "This task does not have results for the specified sample!",
                status_code=404,
            )
        else:
            return annotations
    else:
        return HTTPException(
            status_code=404, content="Predict task not found with that ID!"
        )


@router.put("/models/{model_id}")
async def update_model(
    request: Request,
    model_updates: ModelUpdate,
    project_id: str = Path(
        description="The ID of the project to make model predictions for."
    ),
    model_id: str = Path(
        description="The ID of the model to update information about."
    ),
):
    print(model_updates)
    # Update model status
    db_client = request.app.state.db_client
    await utils.get_project(db_client, project_id)
    # Associate the Celery task ID with the model in the database
    await utils.update_model(
        db_client=db_client, model_id=model_id, updates=model_updates
    )


@router.get("/models/{model_id}/evaluate")
async def evaluate(project_id: str, model_id: str):
    # Get evaluation of model by comparing model predictions to human evaluations
    # Specify samples to use via filters
    # Return overall statistics, as well as correct/incorrect for each sample ID
    pass
