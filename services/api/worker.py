import os
import redis
from celery import Celery
from sklearn.model_selection import train_test_split
from annotators import DataAnnotator, AnnotatorType
from elm_model.annotator import UnetELMDataAnnotator, ClassicELMDataAnnotator
from services.api.crud.db import MongoDBClient
from bson.objectid import ObjectId
import asyncio
from services.api.core.data_loaders import DATA_LOADERS
from services.api.core.views import DATA_VIEWS
from services.api.schemas.projects import Project

ANNOTATORS = {
    AnnotatorType.CLASSIC: ClassicELMDataAnnotator,
    AnnotatorType.UNET: UnetELMDataAnnotator,
}


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
# mongo_url = "mongodb://root:example@localhost:27017"
db_name = "annotate_db"

@app.task()
def run_training(project: Project): # TODO: do we want to support retraining where we only get annotations not previously put into model?
    print(f"Running model training for project {project.id}")
    
    # Create db connection - TODO should this be here or at a per worker / per session level?
    db_client = MongoDBClient(mongo_url, db_name)
    
    # Get all annotations for this project
    annotations = asyncio.run(
        db_client.get_filtered_documents(
        collection="annotations",
        filters={"project_id": project.id, "validated": True},
        )
    )
        
    # Get list of samples which these annotations correspond to
    sample_ids = set([annotation["sample_id"] for annotation in annotations])
    samples = [
        asyncio.run(
            db_client.get_document_by_id(collection="samples", object_id=ObjectId(sample_id)))
        for sample_id in sample_ids
        ]

    train_sample_ids, test_sample_ids, train_samples, test_samples = (
        train_test_split(sample_ids, samples, test_size=0.2, shuffle=True, random_state=42)
    )
    train_annotations = [annotation for annotation in annotations if annotation["sample_id"] in train_samples]
    test_annotations = [annotation for annotation in annotations if annotation["sample_id"] in test_samples]
    
    # Get the data for each sample in each set
    data_loader = DATA_LOADERS[project.data_loader]()
    train_data = [data_loader.get_sample(sample) for sample in train_samples]
    test_data = [data_loader.get_sample(sample) for sample in test_samples]
    
    # Train model
    
    # Evaluate model


@app.task()
def run_inference(project: Project):
    print(f"Creating predictions for project {project.id}")
    
    # Create db connection - TODO should this be here or at a per worker / per session level?
    db_client = MongoDBClient(mongo_url, db_name)
    
    # Find the latest created model for this project
    model = asyncio.run(
        db_client.get_filtered_documents(
        collection="models",
        filters={"project_id": project.id},
        sort_by="timestamp",
        sort_direction=-1,
        )
    )[0]
    
    # Load the model
    
    
    