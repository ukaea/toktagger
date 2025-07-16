import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from services.api.main import app, lifespan
from services.api.crud.db import MongoDBClient
from testcontainers.mongodb import MongoDbContainer
from contextlib import asynccontextmanager
from services.api.schemas.projects import ProjectIn
from services.api.schemas.samples import SampleIn, ShotData

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
async def db_projects(db_client):
    project_1 = ProjectIn(
        name="test_project_0",
        task="ELM",
        query_strategy="random",
        data_loader="uda"
    )
    project_2 = ProjectIn(
        name="test_project_1",
        task="UFO",
        query_strategy="sequential",
        data_loader="image"
    )
    project_3 = ProjectIn(
        name="test_project_2",
        task="disruption",
        query_strategy="uncertainty",
        data_loader="parquet"
    )
    id_1 = await db_client.insert('projects', project_1)
    await asyncio.sleep(0.5)
    id_2 = await db_client.insert('projects', project_2)
    await asyncio.sleep(0.5)
    id_3 = await db_client.insert('projects', project_3)
    yield [id_1, id_2, id_3]
    await db_client.delete_filtered_documents('projects')
    
@pytest_asyncio.fixture(scope="function")
async def db_all(db_client):
    ids = {}
    project = ProjectIn(
        name="test_project",
        task="ELM",
        query_strategy="random",
        data_loader="uda"
    )
    ids['projects'] = await db_client.insert('projects', project)
    
    sample = SampleIn(
        shot_id=1,
        data=ShotData(protocol="uda", signal_names=["Ip"]),
        annotations=None
    )
    ids['samples'] = await db_client.insert('samples', sample)
    
    yield ids
    
    await db_client.delete_filtered_documents('projects')
    await db_client.delete_filtered_documents('samples')
        
    