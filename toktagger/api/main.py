import os
import pathlib
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from toktagger.api.routers.annotations import router as annotations_router
from toktagger.api.routers.annotators import router as annotators_router
from toktagger.api.routers.data import router as data_router
from toktagger.api.routers.models import router as models_router
from toktagger.api.routers.projects import router as projects_router
from toktagger.api.routers.samples import router as samples_router
from toktagger.api.routers.files import router as files_router

from toktagger.api.crud.db import MongoDBClient
from contextlib import asynccontextmanager


@asynccontextmanager
async def lifespan(app: FastAPI):
    mongo_url = os.environ.get("MONGO_URL", "./toktagger_db")
    db_name = "annotate_db"

    app.state.db_client = MongoDBClient(mongo_url, db_name)
    app.state.project = None
    app.state.date_pool = None

    yield

    await app.state.db_client.client.close()


app = FastAPI(lifespan=lifespan)

# Allow requests from the frontend dev server
origins = [
    "http://localhost:5173",
]

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
app.include_router(files_router)
app.include_router(annotators_router)


# Static front end files
frontend_path = pathlib.Path(__file__).parent / "static"
index_file = frontend_path / "index.html"
app.mount("/assets", StaticFiles(directory=frontend_path / "assets"), name="assets")


@app.get("/")
def get_app():
    """Endpoint to serve the main SPA."""
    return FileResponse(index_file)


@app.get("/{full_path:path}")
def spa_fallback(full_path: str):
    """Fallback route to serve the SPA's index.html for any unmatched routes.
    This ensures that refreshing pages on the frontend takes the user to the same place.
    """
    return FileResponse(index_file)
