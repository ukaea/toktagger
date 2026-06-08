import os
import pathlib
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uvicorn
from toktagger.api.routers.annotations import router as annotations_router
from toktagger.api.routers.annotators import router as annotators_router
from toktagger.api.routers.auth import router as auth_router
from toktagger.api.routers.data import router as data_router
from toktagger.api.routers.models import router as models_router
from toktagger.api.routers.projects import router as projects_router
from toktagger.api.routers.samples import router as samples_router
from toktagger.api.routers.users import router as users_router
from toktagger.api.routers.base import router as base_router
from toktagger.api.routers.paths import router as paths_router
from toktagger.api.routers.meta import router as meta_router
from toktagger.api.core.data_loaders import LoaderRegistry
from toktagger.api.crud.db import MongoDBClient
from toktagger.api.auth.first_run import ensure_admin_user
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
    mongo_url = os.environ.get("MONGO_URL", "default")
    db_name = "annotate_db"

    app.state.db_client = MongoDBClient(mongo_url, db_name)
    app.state.project = None

    # Bootstrap admin user on first run; set auth_required flag.
    # TOKTAGGER_AUTH_REQUIRED=false disables auth (tests only).
    if os.environ.get("TOKTAGGER_AUTH_REQUIRED", "true").lower() == "false":
        app.state.auth_required = False
    else:
        app.state.auth_required = await ensure_admin_user(app.state.db_client)

    yield

    await app.state.db_client.client.close()


class Server:
    def __init__(self):
        self.frontend_path = pathlib.Path(__file__).parent / "static"

    def _setup_ray(self):
        from toktagger.api.auth.core import get_internal_token

        if (api_url := os.environ.get("API_URL")) is None:
            raise ValueError("API URL must be set!")
        if not ray.is_initialized():
            ray.init(
                runtime_env={
                    "env_vars": {
                        "API_URL": api_url,
                        "MODEL_STORAGE": os.environ.get("MODEL_STORAGE"),
                        "API_TOKEN": get_internal_token(),
                    }
                },
            )
            WorkerRegistry.options(
                name="WorkerModelRegistry", lifetime="detached"
            ).remote(ModelRegistry._registry)
            WorkerRegistry.options(
                name="WorkerLoaderRegistry", lifetime="detached"
            ).remote(LoaderRegistry._registry)

        self.app.state.task_registry = ActorRegistry(
            max_actors=os.environ.get("MAX_ACTORS", 5)
        )

    def _setup_app(self):
        self.app = FastAPI(lifespan=lifespan)

        origins = [
            "http://localhost:5173",
        ]

        self.app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

        self.app.state.index_file = self.frontend_path / "index.html"
        self.app.mount(
            "/assets",
            StaticFiles(directory=self.frontend_path / "assets"),
            name="assets",
        )

        self.app.include_router(auth_router)
        self.app.include_router(users_router)
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
        if models_dependencies_installed():
            self._setup_ray()
        uvicorn.run(self.app, host=host, port=port)
