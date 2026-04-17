import os
import ray
import pathlib
import typing
from toktagger.api.schemas.projects import Project
from toktagger.api.schemas.samples import Sample, SampleUpdate, SampleUpdateBatchItem
from toktagger.api.schemas.annotations import (
    AnnotationBatchTypeAdapter,
    AnnotationOutTypes,
)
from toktagger.api.schemas.data import DataParamTypes
from pydantic import ValidationError
from toktagger.api.schemas.models import Model, ModelUpdate
from toktagger.api.core.sender import (
    send_batch_samples,
    send_batch_annotations,
    send_model_updates,
)
import logging
from platformdirs import user_cache_dir


logger = logging.getLogger("ray")
logger.setLevel("DEBUG")

models_dir_default = pathlib.Path(user_cache_dir("toktagger", "ukaea")).joinpath(
    "models"
)
models_dir_default.mkdir(parents=True, exist_ok=True)

# Set model storage to default path if not already set
os.environ["MODEL_STORAGE"] = os.environ.get("MODEL_STORAGE", str(models_dir_default))


def get_actor(project, model):
    try:
        logger.info(f"Finding actor for model {model.id}")
        ml_model = ray.get_actor(model.id)
        logger.info("Found existing actor!")
    except ValueError:
        # Actor not alive, so load from weights
        logger.info("Actor not found, loading from disk...")

        model_registry = ray.get_actor("WorkerModelRegistry")
        model_type = ray.get(model_registry.get.remote(model.type))

        ml_model = (
            ray.remote(model_type)
            .options(name=model.id, lifetime="detached")
            .remote(
                model_id=str(model.id),
                project=project,
            )
        )

        model_path = next(
            pathlib.Path(os.environ["MODEL_STORAGE"]).glob(f"{str(model.id)}*"), None
        )
        if model_path:
            ml_model.load.remote(model_path)
        else:
            logger.debug("No saved weights found, initializing blank model")

    return ml_model


@ray.remote
def train_model(
    model: Model,
    project: Project,
    samples: list[Sample],
    annotations: list[list[AnnotationOutTypes]],
    train_val_test_split: typing.Tuple[float, float, float],
    num_epochs: int = 100,
    batch_size: int = 32,
):  # TODO: do we want to support retraining where we only get annotations not previously put into model?
    model_actor = get_actor(project=project, model=model)
    try:
        logger.info(f"Running model training for project {project.id}")
        model_actor.log_progress.remote(training_status="started", progress=0)
        train_task = model_actor.train.remote(
            samples=samples,
            annotations=annotations,
            train_val_test_split=train_val_test_split,
            num_epochs=num_epochs,
        )

        # Wait for train task to complete
        score = ray.get(train_task)

        model_dir = pathlib.Path(os.environ["MODEL_STORAGE"])
        model_dir.mkdir(exist_ok=True)  # Do i need to do this every time?
        model_actor.save.remote(model_dir.joinpath(f"{model.id}.model"))

        send_model_updates(
            project_id=project.id,
            model_id=model.id,
            updates=ModelUpdate(training_status="completed", progress=100, score=score),
        )

    except Exception as e:
        # If anything goes wrong, update model to failed status
        # This is important as if this does not happen, your model will be stuck in 'training' forever,
        # Preventing you from ever starting a new training session again. TODO should we have some kind of timeout in case this fails?
        logger.error(e)
        send_model_updates(
            project_id=project.id,
            model_id=model.id,
            updates=ModelUpdate(training_status="failed"),
        )
        raise e


@ray.remote
def get_predictions(
    project: Project,
    model: Model,
    samples: list[Sample],
    data_params: DataParamTypes,
    batch_size: int = 32,
):
    # For a first pass, when you get next sample on the web UI, run the model to get predictions
    # In the future, can improve that for smarter sampling in active learning
    # Where inference is run on some batch of samples first
    logger.info(
        f"Creating predictions for project {project.id} on {len(samples)} samples."
    )
    model_actor = get_actor(project=project, model=model)

    predictions_task = model_actor.predict.remote(
        samples, data_params=data_params, batch_size=batch_size
    )
    predictions = ray.get(predictions_task)

    samples_batch = [
        SampleUpdateBatchItem(
            id=sample.id, updates=SampleUpdate(validated_annotations=False)
        )
        for sample in samples
    ]

    annotations_batch = []
    for sample, annotations in zip(samples, predictions):
        for annotation in annotations:
            annotation = annotation.model_dump(mode="python")
            annotation["sample_id"] = sample.id
            annotation["project_id"] = project.id
            annotation["shot_id"] = sample.shot_id
            annotation["created_by"] = model.type
            try:
                annotation = AnnotationBatchTypeAdapter.validate_python(annotation)
            except ValidationError as e:
                logger.error(f"Failed to validate annotation: {e}")
            annotations_batch.append(annotation)

    # Return predictions over rest API to server
    send_batch_samples(project.id, samples_batch)
    send_batch_annotations(project.id, annotations_batch)

    logger.info(f"Predictions for project {project.id} complete!")

    return {
        "project_id": project.id,
        "model_type": model.type,
        "sample_ids": [sample.id for sample in samples],
        "annotations": annotations_batch,
    }
