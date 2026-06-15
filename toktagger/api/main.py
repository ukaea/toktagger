import os
import pathlib
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uvicorn
from toktagger.api.routers.annotations import router as annotations_router
from toktagger.api.routers.annotators import router as annotators_router
from toktagger.api.routers.data import router as data_router
from toktagger.api.routers.models import router as models_router
from toktagger.api.routers.projects import router as projects_router
from toktagger.api.routers.samples import router as samples_router
from toktagger.api.routers.base import router as base_router
from toktagger.api.routers.paths import router as paths_router
from toktagger.api.routers.meta import router as meta_router
from toktagger.api.core.data_loaders import LoaderRegistry
from toktagger.api.crud.db import MongoDBClient
from toktagger.api.models import models_dependencies_installed

# Only import large packages if models dependencies installed
if models_dependencies_installed():
    from toktagger.api.models.base import (
        ModelRegistry,
        WorkerRegistry,
        ActorRegistry,
    )
    import ray


@asynccontextmanager
async def lifespan(app: FastAPI):
    mongo_url = os.environ.get("MONGO_URL", "./toktagger_db")
    db_name = "annotate_db"
    cache_dir = os.environ.get("DB_CACHE_DIR")

    app.state.db_client = MongoDBClient(mongo_url, db_name, cache_dir)
    app.state.project = None
    yield

    await app.state.db_client.client.close()


class Server:
    def __init__(self):
        self.frontend_path = pathlib.Path(__file__).parent / "static"
        self.testing_mode = False

    def _setup_ray(self):
        if (api_url := os.environ.get("API_URL")) is None:
            raise ValueError("API URL must be set!")
        if not ray.is_initialized():
            num_gpus = None
            # ALlow the user to force overriding of number of GPUs available
            # This is so that eg Mac can work correctly
            if os.environ.get("FORCE_NUM_GPUS") and os.environ.get("MAX_GPU_ACTORS"):
                print("Warning: Overriding automatically detected GPU availablity!")
                num_gpus = int(os.environ.get("MAX_GPU_ACTORS"))

            ray.init(
                num_gpus=num_gpus if num_gpus else None,
                runtime_env={
                    "env_vars": {
                        "API_URL": api_url,
                        "MODEL_STORAGE": os.environ.get("MODEL_STORAGE"),
                    }
                },
            )
            # Detect available resources
            cluster_resources = ray.cluster_resources()
            cpus_available = int(cluster_resources.get("CPU", 0))
            gpus_available = int(cluster_resources.get("GPU", 0))

            if not cpus_available:
                raise RuntimeError("Ray failed to detect any CPUs!")

            if (max_gpu_actors := os.environ.get("MAX_GPU_ACTORS")) is None:
                max_gpu_actors = int(cluster_resources.get("GPU", 0))

            if (max_actors := os.environ.get("MAX_ACTORS")) is None:
                # Each GPU actor also gets a CPU so subtract these
                # Then subtract one for head node, one for server
                max_actors = cpus_available - max_gpu_actors - 2

            if max_gpu_actors > gpus_available:
                raise RuntimeError("More GPU actors requested than hardware supports!")

            if max_actors > cpus_available + gpus_available:
                raise RuntimeError(
                    "More model actors requested than the detected hardware supports!"
                )

            # Create a ray actor for use as a model registry
            WorkerRegistry.options(
                name="WorkerModelRegistry", lifetime="detached"
            ).remote(ModelRegistry._registry)
            # And one for use as a dataloader registry
            WorkerRegistry.options(
                name="WorkerLoaderRegistry", lifetime="detached"
            ).remote(LoaderRegistry._registry)

        # Create a task registry
        self.app.state.task_registry = ActorRegistry(
            max_actors=max_actors,
            max_gpu_actors=max_gpu_actors,
        )

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
        self.app.state.testing_mode = self.testing_mode
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
        self.app.include_router(paths_router)
        self.app.include_router(meta_router)
        self.app.include_router(base_router)

    def run(
        self,
        host: str = "localhost",
        port: int = 8002,
    ):
        os.environ["API_URL"] = f"http://{host}:{port}"
        self._setup_app()
        # Setup ray if required
        if models_dependencies_installed():
            self._setup_ray()
        uvicorn.run(self.app, host=host, port=port)
