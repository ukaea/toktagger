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

    def store(self, task_ref: ray.ObjectRef) -> str:
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
    mongo_url = os.environ["MONGO_URL"]
    db_name = "annotate_db"

    app.state.db_client = MongoDBClient(mongo_url, db_name)
    app.state.project = None
    app.state.date_pool = None

    if not ray.is_initialized():
        ray.init()
    app.state.task_registry = TaskRegistry(max_actors=5)

    yield

    await app.state.db_client.client.close()


app = FastAPI(lifespan=lifespan)
app.include_router(annotations_router)
app.include_router(data_router)
app.include_router(models_router)
app.include_router(projects_router)
app.include_router(samples_router)
app.include_router(annotators_router)
