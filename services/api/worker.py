import os
import redis
from celery import Celery
from services.api.crud.db import MongoDBClient
from bson.objectid import ObjectId
import asyncio
from services.api.crud import utils
from services.api.schemas.projects import Project
from services.api.schemas.samples import Sample, SampleUpdate
from services.api.schemas.annotations import AnnotationOutTypes
from services.api.schemas.models import Model, ModelUpdate
from services.api.core.models.registry import MODELS
import pathlib
import itertools
from pydantic import TypeAdapter
import requests
from services.api.publisher import publish_progress
REDIS_HOST = os.environ["REDIS_HOST"]
API_URL = os.environ["API_URL"]

app = Celery(
    "tasks",
    broker=f"redis://{REDIS_HOST}:6379/0",  # Redis as a message broker
    backend=f"redis://{REDIS_HOST}:6379/0",  # Redis as result backend
)

redis_broker = redis.Redis(host=f"{REDIS_HOST}", port=6379, db=0)
# Flush broker at start to remove any stale messages.
redis_broker.flushdb()

mongo_url = os.environ["MONGO_URL"]
#mongo_url = "mongodb://root:example@localhost:27017"
db_name = "annotate_db"

async def train_model(project: Project, model: Model, samples: list[Sample], annotations: list[AnnotationOutTypes]): # TODO: do we want to support retraining where we only get annotations not previously put into model?
    try:
        print(f"Running model training for project {project.id}")
        model_dir = pathlib.Path(os.environ["MODEL_STORAGE"])
        model_dir.mkdir(exist_ok=True) # Do i need to do this every time?
                
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
        ml_model = MODELS[model.type](model_id=str(model.id), project=project, samples=samples, annotations=annotations_2d, train_val_test_split=(0.7, 0.2, 0.1), num_epochs=NUM_EPOCHS)
        
        # Train model
        accuracy = ml_model.train(batch_size=BATCH_SIZE)
        
        # Save model weights with file name equal to ID, so that it can be retrieved easily for predictions
        ml_model.save(model_dir.joinpath(f"{model.id}.model"))
        publish_progress(
            id=model.id, 
            collection="models",
            updates=ModelUpdate(training_status="completed", accuracy=accuracy, progress=100))
    
    except Exception as e:
        # If anything goes wrong, update model to failed status
        # This is important as if this does not happen, your model will be stuck in 'training' forever,
        # Preventing you from ever starting a new training session again. TODO should we have some kind of timeout in case this fails?
        publish_progress(
            id=model.id,
            collection="models",
            updates=ModelUpdate(training_status="failed")
            )
        raise e

async def get_predictions(project: Project, model: Model, samples: list[Sample]):
    # For a first pass, when you get next sample on the web UI, run the model to get predictions
    # In the future, can improve that for smarter sampling in active learning
    # Where inference is run on some batch of samples first
    print(f"Creating predictions for project {project.id} on {len(samples)} samples.")
    
    # Create db connection - TODO should this be here or at a per worker / per session level?
    db_client = MongoDBClient(mongo_url, db_name)
    
    # Load the model from the weights stored during training
    model_path = pathlib.Path(os.environ["MODEL_STORAGE"]).joinpath(f"{str(model.id)}.model")
    ml_model = MODELS[model.type].load(project, model_path)
    
    predictions = ml_model.predict(samples, batch_size=32)
    
    
    for i, sample in enumerate(samples):
        # Insert prediction annotations for each sample into the database
        publish_progress(
            id=sample.id, 
            collection="annotations", 
            updates=predictions[i]
            )
        await db_client.insert_many(
            collection="annotations",
            models = predictions[i],
            ids={"project_id": ObjectId(project.id), "sample_id": ObjectId(sample.id)}
        )
        publish_progress(
            id=sample.id, 
            collection="samples", 
            updates=SampleUpdate(validated_annotations=False)
            )
    print("Predictions complete!")
    return predictions
    
@app.task()
def run_training(project: dict, model: dict, samples: list[dict], annotations: list[dict]):
    # Use Pydantic v2 'TypeAdapter' to decide which type of Annotation needs to be used
    annotator_adapter = TypeAdapter(AnnotationOutTypes)
    sample_models = [Sample(**sample) for sample in samples]
    annotation_models = [annotator_adapter.validate_python(ann) for ann in annotations]
    asyncio.run(train_model(project=Project(**project), model=Model(**model)), samples=sample_models, annotations=annotation_models)
    
@app.task()
def run_inference(project: dict, model: dict, samples: list[dict]):
    predictions = asyncio.run(get_predictions(project=Project(**project), model=Model(**model), samples=[Sample(**sample) for sample in samples]))
    return [[annotation.model_dump(mode="python") for annotation in annotations] for annotations in predictions]
