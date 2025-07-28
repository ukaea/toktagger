import os
import redis
from celery import Celery
from sklearn.model_selection import train_test_split
from services.api.crud.db import MongoDBClient
from bson.objectid import ObjectId
import asyncio
from services.api.core.models import MODELS, DisruptionCNN
from services.api.core.data_loaders import DATA_LOADERS
from services.api.core.views import DATA_VIEWS
from services.api.schemas.projects import Project, Task
from services.api.schemas.samples import Sample
from services.api.schemas.annotations import Annotation, AnnotationTypes, TimePoint
from services.api.schemas.models import ModelIn, Model, ModelUpdate
import pathlib
import itertools
from pydantic import TypeAdapter

REDIS_HOST = os.environ["REDIS_HOST"]

app = Celery(
    "tasks",
    broker=f"redis://{REDIS_HOST}:6379/0",  # Redis as a message broker
    backend=f"redis://{REDIS_HOST}:6379/0",  # Redis as result backend
)

redis_client = redis.Redis(host=f"{REDIS_HOST}", port=6379, db=0)
# Flush client at start to remove any stale messages.
redis_client.flushdb()

mongo_url = os.environ["MONGO_URL"]
#mongo_url = "mongodb://root:example@localhost:27017"
db_name = "annotate_db"

async def train_model(project: Project, model: Model): # TODO: do we want to support retraining where we only get annotations not previously put into model?
    try:
        print(f"Running model training for project {project.id}")
        model_dir = pathlib.Path(os.environ["MODEL_STORAGE"])
        model_dir.mkdir(exist_ok=True) # Do i need to do this every time?
        
        db_client = MongoDBClient(mongo_url, db_name)
        
        # Wrap these db queries into a helper function?
        # Get all annotations for this project
        annotations = await db_client.get_filtered_documents(
            collection="annotations",
            sort_by="sample_id",
            filters={"project_id": ObjectId(project.id), "validated": True},
            )
            
        # Get list of samples which these annotations correspond to
        sample_ids = set([annotation["sample_id"] for annotation in annotations])
        samples = [
            Sample(**await db_client.get_document_by_id(collection="samples", object_id=ObjectId(sample_id)))
            for sample_id in sample_ids
            ]
        
        # Use Pydantic v2 'TypeAdapter' to decide which type of Annotation needs to be used
        annotator_model = TypeAdapter(AnnotationTypes)
        
        # Split annotations into 2D list, so annotations[idx] is a list of annotations if samples[idx]
        annotations_2d = [
            [annotator_model.validate_python(ann) for ann in group]
            for key, group in itertools.groupby(
                annotations, key=lambda annotation: annotation['sample_id']
                )
            ]
            
        # Get model
        ml_model = MODELS[model.type](db_client, ObjectId(model.id), project, samples, annotations_2d)
        
        await db_client.update(collection="models", model=ModelUpdate(training_status="started"), object_id=ObjectId(model.id))
        # Train model
        accuracy = await ml_model.train(num_epochs=10, batch_size=32)
        
        # Save model with name equal to ID
        ml_model.save(model_dir.joinpath(f"{model.id}.model"))
        await db_client.update(collection="models", model=ModelUpdate(training_status="completed", accuracy=accuracy, progress=100), object_id=ObjectId(model.id))
    
    except Exception as e:
        await db_client.update(collection="models", model=ModelUpdate(training_status="failed"), object_id=ObjectId(model.id))
        raise e

async def get_predictions(project: Project, model: Model, samples: list[Sample]):
    # For a first pass, when you get next sample on the web UI, run the model to get predictions
    # In the future, can improve that for smarter sampling in active learning
    # Where inference is run on some batch of samples first
    print(f"Creating predictions for project {project.id}")
    
    # Create db connection - TODO should this be here or at a per worker / per session level?
    db_client = MongoDBClient(mongo_url, db_name)
    
    model_path = pathlib.Path(os.environ["MODEL_STORAGE"]).joinpath(f"{str(model.id)}.model")
    
    # Load the model
    ml_model = MODELS[model.type].load(project, model_path)
    
    predictions = ml_model.predict(samples, batch_size=32)
    print(predictions)
    
    for i, sample in enumerate(samples):
        await db_client.insert_many(
            collection="annotations",
            models = predictions[i],
            ids={"project_id": ObjectId(project.id), "sample_id": ObjectId(sample.id)}
        )
    
@app.task()
def run_training(project: dict, model: dict):
    asyncio.run(train_model(project=Project(**project), model=Model(**model)))
    
@app.task()
def run_inference(project: dict, model: dict, samples: list[dict]):
    asyncio.run(get_predictions(project=Project(**project), model=Model(**model), samples=[Sample(**sample) for sample in samples]))