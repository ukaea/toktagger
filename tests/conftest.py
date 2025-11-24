import pytest
import pytest_asyncio
from toktagger.api.main import Server
from toktagger.api.crud.db import MongoDBClient
from testcontainers.mongodb import MongoDbContainer
import tests.db_definitions as db_definitions
from bson.objectid import ObjectId

import asyncio
from httpx import AsyncClient, ASGITransport
import os
import ray


@pytest.fixture(scope="function")
def uda_env_vars():
    os.environ.setdefault("UDA_HOST", "uda2.mast.l")
    os.environ.setdefault("UDA_META_PLUGINNAME", "MASTU_DB")
    os.environ.setdefault("UDA_METANEW_PLUGINNAME", "MAST_DB")


@pytest.fixture(scope="session")
def mongo_container():
    with MongoDbContainer("mongo:latest") as mongo:
        yield mongo.get_connection_url()


@pytest.fixture(scope="session", autouse=True)
def ray_session():
    os.environ["MODEL_STORAGE"] = "Test"
    ray.init(
        ignore_reinit_error=True, local_mode=True, runtime_env={"working_dir": None}
    )
    yield
    ray.shutdown()


@pytest_asyncio.fixture(scope="function")
async def db_client(mongo_container):
    db_client = MongoDBClient(mongo_container, "annotate_db")
    yield db_client

    await db_client.delete_filtered_documents("projects")
    await db_client.delete_filtered_documents("samples")
    await db_client.delete_filtered_documents("annotations")
    await db_client.delete_filtered_documents("models")
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
    server = Server()
    server._setup_app()
    app = server.app
    lifespan_ctx = app.router.lifespan_context(app)
    await lifespan_ctx.__aenter__()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        os.environ["API_URL"] = ""
        yield client
    await lifespan_ctx.__aexit__(None, None, None)


@pytest_asyncio.fixture(scope="function")
async def setup_db(db_client):
    project_id_1 = await db_client.insert("projects", db_definitions.PROJECT_1)
    await asyncio.sleep(0.01)
    project_id_2 = await db_client.insert("projects", db_definitions.PROJECT_2)
    await asyncio.sleep(0.01)
    project_id_3 = await db_client.insert("projects", db_definitions.PROJECT_3)
    await asyncio.sleep(0.01)
    sample_id_1 = await db_client.insert(
        "samples", db_definitions.SAMPLE_1, ids={"project_id": ObjectId(project_id_1)}
    )
    await asyncio.sleep(0.01)
    sample_id_2 = await db_client.insert(
        "samples", db_definitions.SAMPLE_2, ids={"project_id": ObjectId(project_id_1)}
    )
    await asyncio.sleep(0.01)
    sample_id_3 = await db_client.insert(
        "samples", db_definitions.SAMPLE_3, ids={"project_id": ObjectId(project_id_2)}
    )
    await asyncio.sleep(0.01)
    sample_id_4 = await db_client.insert(
        "samples", db_definitions.SAMPLE_4, ids={"project_id": ObjectId(project_id_2)}
    )
    await asyncio.sleep(0.01)
    annotation_id_1 = await db_client.insert(
        "annotations",
        db_definitions.ANNOTATION_1,
        ids={"project_id": ObjectId(project_id_1), "sample_id": ObjectId(sample_id_1)},
    )
    await asyncio.sleep(0.01)
    annotation_id_2 = await db_client.insert(
        "annotations",
        db_definitions.ANNOTATION_2,
        ids={"project_id": ObjectId(project_id_1), "sample_id": ObjectId(sample_id_1)},
    )
    await asyncio.sleep(0.01)
    annotation_id_3 = await db_client.insert(
        "annotations",
        db_definitions.ANNOTATION_3,
        ids={"project_id": ObjectId(project_id_1), "sample_id": ObjectId(sample_id_1)},
    )
    await asyncio.sleep(0.01)
    annotation_id_4 = await db_client.insert(
        "annotations",
        db_definitions.ANNOTATION_4,
        ids={"project_id": ObjectId(project_id_1), "sample_id": ObjectId(sample_id_2)},
    )
    await asyncio.sleep(0.01)
    annotation_id_5 = await db_client.insert(
        "annotations",
        db_definitions.ANNOTATION_5,
        ids={"project_id": ObjectId(project_id_2), "sample_id": ObjectId(sample_id_4)},
    )
    await asyncio.sleep(0.01)
    model_id_1 = await db_client.insert(
        "models",
        db_definitions.MODEL_1,
        ids={"project_id": ObjectId(project_id_1)},
    )
    await asyncio.sleep(0.01)
    model_id_2 = await db_client.insert(
        "models",
        db_definitions.MODEL_2,
        ids={"project_id": ObjectId(project_id_1)},
    )
    await asyncio.sleep(0.01)
    model_id_3 = await db_client.insert(
        "models",
        db_definitions.MODEL_3,
        ids={"project_id": ObjectId(project_id_1)},
    )
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
        "annotation_id_5": annotation_id_5,
        "model_id_1": model_id_1,
        "model_id_2": model_id_2,
        "model_id_3": model_id_3,
    }


@pytest_asyncio.fixture(scope="function")
async def setup_db_small(db_client):
    ids = {}
    ids["projects"] = await db_client.insert("projects", db_definitions.PROJECT_1)
    ids["samples"] = await db_client.insert(
        "samples",
        db_definitions.SAMPLE_1,
        ids={"project_id": ObjectId(ids["projects"])},
    )
    ids["annotations"] = await db_client.insert(
        "annotations",
        db_definitions.ANNOTATION_1,
        ids={
            "project_id": ObjectId(ids["projects"]),
            "sample_id": ObjectId(ids["samples"]),
        },
    )

    yield ids

    await db_client.delete_filtered_documents("projects")
    await db_client.delete_filtered_documents("samples")
    await db_client.delete_filtered_documents("annotations")
