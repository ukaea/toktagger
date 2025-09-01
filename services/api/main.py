import os
import pathlib
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from services.api.routers.annotations import router as annotations_router
from services.api.routers.annotators import router as annotators_router
from services.api.routers.data import router as data_router
from services.api.routers.models import router as models_router
from services.api.routers.projects import router as projects_router
from services.api.routers.samples import router as samples_router
from services.api.crud.db import MongoDBClient
from contextlib import asynccontextmanager


@asynccontextmanager
async def lifespan(app: FastAPI):
    mongo_url = os.environ["MONGO_URL"]
    # mongo_url = "mongodb://root:example@localhost:27017"
    db_name = "annotate_db"

    app.state.db_client = MongoDBClient(mongo_url, db_name)
    app.state.project = None
    app.state.date_pool = None

    yield

    await app.state.db_client.client.close()


# Allow requests from your frontend dev server
origins = [
    "http://localhost:5173",
]


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  # or ["*"] to allow all
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(annotations_router)
app.include_router(data_router)
app.include_router(models_router)
app.include_router(projects_router)
app.include_router(samples_router)
app.include_router(annotators_router)

# Static front end files
frontend_path = pathlib.Path(__file__).parent.parent / "ui" / "dist"
app.mount("/", StaticFiles(directory=frontend_path, html=True), name="spa")
