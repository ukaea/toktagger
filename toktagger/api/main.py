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
from toktagger.api.routers.files import router as files_router
from toktagger.api.routers.meta import router as meta_router

from toktagger.api.crud.db import MongoDBClient
from contextlib import asynccontextmanager
import uvicorn
import ray
import uuid


class TaskRegistry:
    """Registry to keep track of Ray actors, and the task they are associated with."""

    def __init__(self, max_actors: int):
        """Create task registry

        Parameters
        ----------
        max_actors : int
            Maximum number of actors to keep alive simultaneously
        """
        self.max_actors = max_actors
        self.tasks = {}
        self.actors = []

    def register(self, task_ref: ray.ObjectRef) -> str:
        """Store a Ray task reference in the registry and associate with a UUID.

        Parameters
        ----------
        task_ref : ray.ObjectRef
            The reference to the Ray task

        Returns
        -------
        str
            A unique identifier for this task
        """
        task_id = str(uuid.uuid4())
        self.tasks[task_id] = task_ref
        return task_id

    def get(self, task_id: str) -> ray.ObjectRef | None:
        """Convert a task ID back into the Ray task reference

        Parameters
        ----------
        task_id : str
            The unique identifier for this task

        Returns
        -------
        ray.ObjectRef | None
            The Ray task reference, if it exists in the Registry
        """
        return self.tasks.get(task_id)

    def update_actors(self, actor_name: str) -> None:
        """Record that a Ray Actor has been accessed, and kill any stale Actors.

        Parameters
        ----------
        actor_name : str
            The name of the Ray Actor
        """
        if actor_name in self.actors:
            self.actors.remove(actor_name)

        self.actors.append(actor_name)

        if len(self.actors) > self.max_actors:
            stale_actor = self.actors.pop(0)
            try:
                actor = ray.get_actor(stale_actor)
                ray.kill(actor)
            except ValueError:
                return


@asynccontextmanager
async def lifespan(app: FastAPI):
    mongo_url = os.environ.get("MONGO_URL", "./toktagger_db")
    db_name = "annotate_db"

    app.state.db_client = MongoDBClient(mongo_url, db_name)
    app.state.project = None

    if not ray.is_initialized():
        ray.init()
    app.state.task_registry = TaskRegistry(max_actors=5)

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
        self.app.include_router(meta_router)
        self.app.include_router(base_router)

    def run(
        self,
        host: str = "localhost",
        port: int = 8002,
    ):
        self._setup_app()
        uvicorn.run(self.app, host=host, port=port)
