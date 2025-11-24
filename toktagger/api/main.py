import os
import pathlib
import tomllib
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
from toktagger.api.routers.files import router as files_router
from toktagger.api.schemas import convert_to_objectid
from toktagger.api.schemas.projects import ProjectIn
from toktagger.api.crud import utils
from toktagger.api.crud.db import MongoDBClient
from contextlib import asynccontextmanager
import uvicorn

from toktagger.api.schemas.samples import (
    FileProtocol,
    FileType,
    SampleIn,
    ShotData,
    ShotProtocol,
    TimeSeriesFileData,
)


async def create_samples(app, project_id: str):
    db_client = app.state.db_client
    project = await utils.get_project(db_client, project_id)
    samples = []

    if project.data_loader.name == "parquet":
        path = pathlib.Path(project.data_loader.file_path)
        local_files = path.glob("*.parquet")
        shot_numbers = [f.stem for f in local_files]

        for shot_id in shot_numbers:
            data = TimeSeriesFileData(
                file_name=str(path / f"{shot_id}.parquet"),
                type=FileType.PARQUET,
                protocol=FileProtocol.LOCAL,
                column_names=project.tasks[0].signal_names,
            )
            sample = SampleIn(shot_id=int(shot_id), data=data)
            samples.append(sample)

    elif project.data_loader.name == "uda":
        shot_min = project.data_loader.shot_min
        shot_max = project.data_loader.shot_max

        for shot_id in range(shot_min, shot_max + 1):
            data = ShotData(
                protocol=ShotProtocol.UDA,
                signal_names=project.tasks[0].signal_names,
            )
            sample = SampleIn(shot_id=shot_id, data=data)
            samples.append(sample)

    # Insert new samples
    await db_client.insert_many(
        collection="samples",
        models=samples,
        ids={"project_id": convert_to_objectid(project_id, "projects")},
    )


async def setup_projects(app):
    db_client = app.state.db_client
    config_files = pathlib.Path(__file__).parent.parent.parent / "configs"

    for config_file in config_files.glob("*.toml"):
        with config_file.open("rb") as config_file:
            config = tomllib.load(config_file)

        project = ProjectIn(**config["project"])
        existing_project = await utils.get_projects(db_client, project.name)
        if len(existing_project) == 0:
            project_id = await db_client.insert(collection="projects", model=project)
            await create_samples(app, project_id)


@asynccontextmanager
async def lifespan(app: FastAPI):
    mongo_url = os.environ.get("MONGO_URL", "./toktagger_db")
    db_name = "annotate_db"

    app.state.db_client = MongoDBClient(mongo_url, db_name)

    await setup_projects(app)

    yield

    await app.state.db_client.client.close()


class Server:
    def __init__(self):
        self.frontend_path = pathlib.Path(__file__).parent / "static"

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
        self.app.state.index_file = self.frontend_path / "index.html"
        self.app.mount(
            "/assets",
            StaticFiles(directory=self.frontend_path / "assets"),
            name="assets",
        )

        self.app.include_router(annotations_router)
        self.app.include_router(data_router)
        self.app.include_router(models_router)
        self.app.include_router(projects_router)
        self.app.include_router(samples_router)
        self.app.include_router(annotators_router)
        self.app.include_router(files_router)
        self.app.include_router(base_router)

    def run(
        self,
        host: str = "localhost",
        port: int = 8002,
    ):
        self._setup_app()
        uvicorn.run(self.app, host=host, port=port)
