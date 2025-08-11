import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from services.api.main import app, lifespan
from services.api.crud.db import MongoDBClient
from testcontainers.mongodb import MongoDbContainer
from contextlib import asynccontextmanager
from services.api.schemas.projects import ProjectIn
from services.api.schemas.samples import SampleIn, ShotData, TimeSeriesFileData
from services.api.schemas.annotations import TimePoint, TimeRegion
from tests.db_definitions import PROJECT, SAMPLE, ANNOTATION
from bson.objectid import ObjectId
import pathlib

import time
import asyncio
from httpx import AsyncClient, ASGITransport
import os

# @pytest.fixture(scope="session")
# def event_loop():
#     loop = asyncio.new_event_loop()
#     yield loop
#     loop.close()

@pytest.fixture(scope="session")
def mongo_container():
    with MongoDbContainer("mongo:latest") as mongo:
        yield mongo.get_connection_url()
        
@pytest_asyncio.fixture(scope="function")
async def db_client(mongo_container):
    db_client = MongoDBClient(mongo_container, "annotate_db")
    yield db_client
    
    await db_client.delete_filtered_documents('projects')
    await db_client.delete_filtered_documents('samples')
    await db_client.delete_filtered_documents('annotations')
    await db_client.delete_filtered_documents('models')
    await db_client.client.close()

@pytest_asyncio.fixture(scope="function")
async def api_client(mongo_container):
    os.environ["MONGO_URL"] = mongo_container
    # Have hit various issues getting this setup
    # Using fastAPI TestClient() doesn't play well with async pymongo as it tries to do stuff in different event loops
    # So have to use this AsyncClient from httpx, but this no longer just accepts an app
    # So have to wrap it in this Transport thing, but that for some reason doesnt run the lifespan in the app
    # So have to run this manually, however trying to run the close after the yield to close the db connection gives errors
    # So am just going to leave it open, since the db container will be deleted after anyway
    # Any alternative solution ideas are welcome.....
    lifespan_ctx = app.router.lifespan_context(app)
    await lifespan_ctx.__aenter__()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    await lifespan_ctx.__aexit__(None, None, None)

@pytest_asyncio.fixture(scope="function")
async def setup_db(db_client):
    project_1 = PROJECT
    project_2 = ProjectIn(
        name="test_project_1",
        task="ELM",
        query_strategy="sequential",
        data_loader="parquet"
    )
    project_3 = ProjectIn(
        name="test_project_2",
        task="UFO",
        query_strategy="uncertainty",
        data_loader="image"
    )
    sample_1 = SAMPLE
    sample_2 = SampleIn(
        shot_id=3,
        data=ShotData(protocol="sal", signal_names=["Ip"]),
        annotations=None
    ) 
    sample_3 = SampleIn(
        shot_id=2,
        data=TimeSeriesFileData(file_name="test.csv", type="csv", protocol="s3", column_names=["Ip"]),
        annotations=None
    ) 
    sample_4 = SampleIn(
        shot_id=4,
        data=TimeSeriesFileData(file_name=str(pathlib.Path(__file__).parent.joinpath("test.parquet").absolute()), type="parquet", protocol="file", column_names=["Ip"]),
        annotations=None
    )
    annotation_1 = ANNOTATION
    annotation_2 = TimeRegion(time_min=0.1, time_max=0.2, label="ramp_up", validated=True)
    annotation_3 = TimePoint(time=0.1, label="disruption", validated=False)
    annotation_4 = TimePoint(time=0.3, label="disruption", validated=False)
    project_id_1 = await db_client.insert('projects', project_1)
    await asyncio.sleep(0.01)
    project_id_2 = await db_client.insert('projects', project_2)
    await asyncio.sleep(0.01)
    project_id_3 = await db_client.insert('projects', project_3)
    await asyncio.sleep(0.01)
    sample_id_1 = await db_client.insert('samples', sample_1, ids={"project_id": ObjectId(project_id_1)})
    await asyncio.sleep(0.01)
    sample_id_2 = await db_client.insert('samples', sample_2, ids={"project_id": ObjectId(project_id_1)})
    await asyncio.sleep(0.01)
    sample_id_3 = await db_client.insert('samples', sample_3, ids={"project_id": ObjectId(project_id_1)})
    await asyncio.sleep(0.01)
    sample_id_4 = await db_client.insert('samples', sample_4, ids={"project_id": ObjectId(project_id_2)})
    await asyncio.sleep(0.01)
    annotation_id_1 = await db_client.insert('annotations', annotation_1, ids={"project_id": ObjectId(project_id_1), "sample_id": ObjectId(sample_id_1)})
    await asyncio.sleep(0.01)
    annotation_id_2 = await db_client.insert('annotations', annotation_2, ids={"project_id": ObjectId(project_id_1), "sample_id": ObjectId(sample_id_1)})
    await asyncio.sleep(0.01)
    annotation_id_3 = await db_client.insert('annotations', annotation_3, ids={"project_id": ObjectId(project_id_1), "sample_id": ObjectId(sample_id_1)})
    await asyncio.sleep(0.01)
    annotation_id_4 = await db_client.insert('annotations', annotation_4, ids={"project_id": ObjectId(project_id_1), "sample_id": ObjectId(sample_id_2)})
    await asyncio.sleep(0.01)
    annotation_id_5 = await db_client.insert('annotations', annotation_4, ids={"project_id": ObjectId(project_id_2), "sample_id": ObjectId(sample_id_4)})
    yield {
           "project_id_1": project_id_1,
           "project_id_2": project_id_2,
           "project_id_3": project_id_3,
           "sample_id_1": sample_id_1,
           "sample_id_2": sample_id_2,
           "sample_id_3": sample_id_3,
           "sample_id_4": sample_id_4,
           "annotation_id_1": annotation_id_1,
           "annotation_id_2": annotation_id_2,
           "annotation_id_3": annotation_id_3,
           "annotation_id_4": annotation_id_4,
           "annotation_id_5": annotation_id_5
           }

    
@pytest_asyncio.fixture(scope="function")
async def db_all(db_client):
    ids = {}
    ids['projects'] = await db_client.insert('projects', PROJECT)
    ids['samples'] = await db_client.insert('samples', SAMPLE)
    ids['annotations'] = await db_client.insert('annotations', ANNOTATION)
    
    yield ids
    
    await db_client.delete_filtered_documents('projects')
    await db_client.delete_filtered_documents('samples')
    await db_client.delete_filtered_documents('annotations')  
    