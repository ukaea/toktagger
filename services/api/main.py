import os
import ray
from fastapi import FastAPI
from services.api.routers.annotations import router as annotations_router
from services.api.routers.annotators import router as annotators_router
from services.api.routers.data import router as data_router
from services.api.routers.models import router as models_router
from services.api.routers.projects import router as projects_router
from services.api.routers.samples import router as samples_router
from services.api.crud.db import MongoDBClient
from contextlib import asynccontextmanager
import uuid


class TaskRegistry:
    def __init__(self):
        self.tasks = {}

    def store(self, task_ref):
        task_id = str(uuid.uuid4())
        self.tasks[task_id] = task_ref
        return task_id

    def get(self, task_id):
        return self.tasks.get(task_id)


@asynccontextmanager
async def lifespan(app: FastAPI):
    mongo_url = os.environ["MONGO_URL"]
    db_name = "annotate_db"

    app.state.db_client = MongoDBClient(mongo_url, db_name)
    app.state.project = None
    app.state.date_pool = None

    ray.init()

    app.state.task_registry = TaskRegistry()

    yield

    await app.state.db_client.client.close()


app = FastAPI(lifespan=lifespan)
app.include_router(annotations_router)
app.include_router(data_router)
app.include_router(models_router)
app.include_router(projects_router)
app.include_router(samples_router)
app.include_router(annotators_router)
