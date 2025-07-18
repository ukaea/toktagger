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
from services.api.schemas.projects import Project
from services.api.schemas.samples import Sample
from services.api.schemas.annotations import Annotation, AnnotationTypes, TimePoint

import itertools

# REDIS_HOST = os.environ["REDIS_HOST"]

# app = Celery(
#     "tasks",
#     broker=f"redis://{REDIS_HOST}:6379/0",  # Redis as a message broker
#     backend=f"redis://{REDIS_HOST}:6379/0",  # Redis as result backend
# )

# redis_client = redis.Redis(host=f"{REDIS_HOST}", port=6379, db=0)
# # Flush client at start to remove any stale messages.
# redis_client.flushdb()

#mongo_url = os.environ["MONGO_URL"]
mongo_url = "mongodb://root:example@localhost:27017"
db_name = "annotate_db"

# @app.task()
async def run_training(project: Project): # TODO: do we want to support retraining where we only get annotations not previously put into model?
    print(f"Running model training for project {project.id}")
    
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
    
    # Split annotations into 2D list, so annotations[idx] is a list of annotations if samples[idx]
    annotations_2d = [
        [TimePoint(**ann) for ann in group] # TODO how to make this generic for any anntoation type?
        for key, group in itertools.groupby(
            annotations, key=lambda annotation: annotation['sample_id']
            )
        ]
    print(len(annotations_2d))
    print(len(samples))
    
    # Here down should have some flexibility for different models, model specific?
    
    # Get model
    model = DisruptionCNN(project, samples, annotations_2d)
    # Train model
    losses = model.train(num_epochs=50, batch_size=32)
    print(losses)
    
    model.save("model.pt")
    
    # Evaluate model

#@app.task()
async def run_inference(project: Project, sample_ids: list[str]):
    # For a first pass, when you get next sample on the web UI, run the model to get predictions
    # In the future, can improve that for smarter sampling in active learning
    # Where inference is run on some batch of samples first
    print(f"Creating predictions for project {project.id}")
    
    # Create db connection - TODO should this be here or at a per worker / per session level?
    db_client = MongoDBClient(mongo_url, db_name)
    
    # Find the latest created model for this project
    # TODO get model from DB
    # model = asyncio.run(
    #     db_client.get_filtered_documents(
    #     collection="models",
    #     filters={"project_id": project.id},
    #     sort_by="timestamp",
    #     sort_direction=-1,
    #     )
    # )[0]
    # Get samples
    samples = [
        Sample(**await db_client.get_document_by_id(collection="samples", object_id=ObjectId(sample_id)))
        for sample_id in sample_ids
        ]
    # Load the model
    model = DisruptionCNN(project, samples)
    model.load("model.pt") # TODO should be from DB
    
    mean, uncertainty =  model.predict(batch_size=32)
    
    annotations = []
    for sample in samples:
        annotation = await db_client.get_filtered_documents(
            collection="annotations",
            filters={"sample_id": ObjectId(sample.id)},
            )
        annotations.append(annotation[0]['time'])
        
    print("mean=", mean)
    print("uncertainty=", uncertainty)
    print("annotations=", annotations)
    return mean
    
if __name__ == "__main__":
    db_client = MongoDBClient(mongo_url, db_name)
    
    # Get project, this would come from API
    PROJECT_ID = "687a6ebb5589c8a380cb76f4"
    project = asyncio.run(db_client.get_document_by_id(collection="projects", object_id=ObjectId(PROJECT_ID)))
    db_client = MongoDBClient(mongo_url, db_name)
    
    #asyncio.run(run_training(project=Project(**project)))
    
    samples = [
        "687a5aacd311e40b035a10cf",
        "687a5aacd311e40b035a10d8",
        "687a5aacd311e40b035a10dc",
        "687a5aacd311e40b035a10fb",
        "687a5aacd311e40b035a1105",
    ]
    
    mean= asyncio.run(run_inference(project=Project(**project), sample_ids=samples))