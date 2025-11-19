import os
import pathlib
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from toktagger.api.routers.annotations import router as annotations_router
from toktagger.api.routers.annotators import router as annotators_router
from toktagger.api.routers.data import router as data_router
from toktagger.api.routers.models import router as models_router
from toktagger.api.routers.projects import router as projects_router
from toktagger.api.routers.samples import router as samples_router
from toktagger.api.routers.base import router as base_router
from toktagger.api.crud.db import MongoDBClient
from contextlib import asynccontextmanager
import uvicorn


@asynccontextmanager
async def lifespan(app: FastAPI):
    mongo_url = os.environ.get("MONGO_URL", "./toktagger_db")
    db_name = "annotate_db"

    app.state.db_client = MongoDBClient(mongo_url, db_name)
    app.state.project = None

    yield

    await app.state.db_client.client.close()


class Server:
    def __init__(self):
        self.frontend_path = pathlib.Path(__file__).parent.joinpath("static")

    def _setup_app(self):
        self.app = FastAPI(lifespan=lifespan)

        # Allow requests from the frontend dev server
        origins = [
            "http://localhost:5173",
        ]

        self.app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,  # or ["*"] to allow all
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

        # Static front end files
        self.app.state.index_file = self.frontend_path.joinpath("index.html")
        self.app.mount(
            "/assets",
            StaticFiles(directory=self.frontend_path.joinpath("assets")),
            name="assets",
        )

        self.app.include_router(annotations_router)
        self.app.include_router(data_router)
        self.app.include_router(models_router)
        self.app.include_router(projects_router)
        self.app.include_router(samples_router)
        self.app.include_router(annotators_router)
        self.app.include_router(base_router)

    def run(
        self,
        host: str = "localhost",
        port: int = 8002,
    ):
        self._setup_app()
        uvicorn.run(self.app, host=host, port=port)
