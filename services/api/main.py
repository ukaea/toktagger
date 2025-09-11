import os
from fastapi import FastAPI
from services.api.routers.annotations import router as annotations_router
from services.api.routers.annotators import router as annotators_router
from services.api.routers.data import router as data_router
from services.api.routers.models import router as models_router
from services.api.routers.projects import router as projects_router
from services.api.routers.samples import router as samples_router
from services.api.crud.db import MongoDBClient
from services.api.crud.listener import redis_listener
from contextlib import asynccontextmanager
import asyncio

@asynccontextmanager
async def lifespan(app: FastAPI):
    mongo_url = os.environ["MONGO_URL"]
    db_name = "annotate_db"

    app.state.db_client = MongoDBClient(mongo_url, db_name)
    app.state.project = None
    app.state.date_pool = None
    redis_listener_task = asyncio.create_task(redis_listener(app.state.db_client))

    yield
    
    redis_listener_task.cancel()
    try:
        await redis_listener_task
    except asyncio.CancelledError:
        pass
    
    await app.state.db_client.client.close()


app = FastAPI(lifespan=lifespan)
app.include_router(annotations_router)
app.include_router(data_router)
app.include_router(models_router)
app.include_router(projects_router)
app.include_router(samples_router)
app.include_router(annotators_router)
