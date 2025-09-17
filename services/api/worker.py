import os
import ray
from services.api.schemas.projects import Project
from services.api.schemas.samples import Sample, SampleUpdate, SampleUpdateBatchItem
from services.api.schemas.annotations import AnnotationOutTypes, AnnotationBatchItem
from services.api.schemas.models import Model, ModelUpdate
from services.api.models.registry import MODELS
import pathlib
import itertools
from services.api.core.sender import (
    send_batch_samples,
    send_batch_annotations,
    send_model_updates,
)


@ray.remote
def train_model(
    project: Project,
    model: Model,
    samples: list[Sample],
    annotations: list[AnnotationOutTypes],
):  # TODO: do we want to support retraining where we only get annotations not previously put into model?
    try:
        print(f"Running model training for project {project.id}")
        model_dir = pathlib.Path(os.environ["MODEL_STORAGE"])
        model_dir.mkdir(exist_ok=True)  # Do i need to do this every time?

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

        # TODO: Where should epochs, batch size be passed in???
        BATCH_SIZE = 32
        NUM_EPOCHS = 10

        # Get model
        ml_model = MODELS[model.type](
            model_id=str(model.id),
            project=project,
            samples=samples,
            annotations=annotations_2d,
            train_val_test_split=(0.7, 0.2, 0.1),
            num_epochs=NUM_EPOCHS,
        )

        # Train model
        accuracy = ml_model.train(batch_size=BATCH_SIZE)

        # Save model weights with file name equal to ID, so that it can be retrieved easily for predictions
        ml_model.save(model_dir.joinpath(f"{model.id}.model"))
        send_model_updates(
            project_id=project.id,
            model_id=model.id,
            updates=ModelUpdate(
                training_status="completed", accuracy=accuracy, progress=100
            ),
        )

    except Exception as e:
        # If anything goes wrong, update model to failed status
        # This is important as if this does not happen, your model will be stuck in 'training' forever,
        # Preventing you from ever starting a new training session again. TODO should we have some kind of timeout in case this fails?
        send_model_updates(
            project_id=project.id,
            model_id=model.id,
            updates=ModelUpdate(training_status="failed"),
        )
        raise e


@ray.remote
def get_predictions(project: Project, model: Model, samples: list[Sample]):
    # For a first pass, when you get next sample on the web UI, run the model to get predictions
    # In the future, can improve that for smarter sampling in active learning
    # Where inference is run on some batch of samples first
    print(f"Creating predictions for project {project.id} on {len(samples)} samples.")

    # Load the model from the weights stored during training
    model_path = pathlib.Path(os.environ["MODEL_STORAGE"]).joinpath(
        f"{str(model.id)}.model"
    )
    ml_model = MODELS[model.type].load(project, model_path)

    predictions = ml_model.predict(samples, batch_size=32)

    samples_batch = [
        SampleUpdateBatchItem(
            id=sample.id, updates=SampleUpdate(validated_annotations=False)
        )
        for sample in samples
    ]
    annotations_batch = [
        AnnotationBatchItem(sample_id=sample.id, annotations=annotations)
        for sample, annotations in zip(samples, predictions)
    ]

    # Return predictions over rest API to server
    send_batch_samples(project.id, samples_batch)
    send_batch_annotations(project.id, annotations_batch)

    print("Predictions complete!")

    return {
        "project_id": project.id,
        "model_type": model.type,
        "sample_ids": [sample.id for sample in samples],
        "annotations": {
            sample.id: [
                annotation.model_dump(mode="python") for annotation in annotations
            ]
            for sample, annotations in zip(samples, predictions)
        },
    }
