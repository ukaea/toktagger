from toktagger.api.schemas.annotations import TimePointBatch
from toktagger.api.schemas.samples import SampleIn, TimeSeriesFileData
from toktagger.api.models.base import ModelRegistry, WorkerRegistry
from toktagger.api.core.data_loaders import LoaderRegistry
import tests.db_definitions as db_definitions
from bson.objectid import ObjectId
import ray
import random
import pytest
import pytest_asyncio
import os
import toktagger.api.config as config


@pytest.fixture(scope="module")
def ray_session(settings):
    # Ray copies the value of the API_URL env var if already set in this local env
    # We want it to be blank inside the ray worker nodes, so that it doesn't try to send stuff to API
    # Cannot explicitly pass a None, it requires a str:str dict in env_vars
    # So will pop the env varvalue, init ray, then restore it
    if (api_url := os.environ.get("API_URL")) is not None:
        api_url = os.environ.pop("API_URL")
    ray.init(
        ignore_reinit_error=True,
        include_dashboard=False,
        runtime_env={"env_vars": {"MODEL_STORAGE": str(settings.models.cache_dir)}},
    )
    if api_url is not None:
        os.environ["API_URL"] = api_url

    # Create a ray actor for use as a model registry
    WorkerRegistry.options(name="WorkerModelRegistry", lifetime="detached").remote(
        ModelRegistry._registry
    )
    # And one for use as a dataloader registry
    WorkerRegistry.options(name="WorkerLoaderRegistry", lifetime="detached").remote(
        LoaderRegistry._registry
    )

    # Block until the Ray worker environment is initialised (venv + working dir
    # package) so the first test does not race against setup and hit the
    # ray.get(timeout=30) limit. Import from the project so the working-dir
    # runtime_env zip is unpacked on the worker before any test tasks run.
    @ray.remote
    def _warmup():
        import toktagger  # noqa: F401

        return True

    ray.get(_warmup.remote(), timeout=90)
    yield
    ray.shutdown()


@pytest.fixture(scope="package")
def setup_model_samples():
    # Create sample data for training / predicting a Disruption model
    samples = []
    for i in range(9980, 10000):
        # Generate sample data
        disruption_time = random.randint(80, 100)
        annotation = TimePointBatch(
            shot_id=i,
            validated=True,
            label="Disruption",
            time=disruption_time,
            created_by="manual" if i < 9985 else "disruption_cnn",
        )

        samples.append(
            SampleIn(
                shot_id=i,
                data=TimeSeriesFileData(
                    file_name=f"{i}.parquet",
                    type="parquet",
                ),
                annotations=[annotation] if i < 9990 else None,
            )
        )

    yield samples


@pytest_asyncio.fixture(scope="function")
async def setup_model_db(setup_model_samples, ray_session, db_client):
    project_id = await db_client.insert("projects", db_definitions.PROJECT_2)
    sample_ids = []
    for sample in setup_model_samples:
        sample_id = await db_client.insert(
            "samples", sample, ids={"project_id": ObjectId(project_id)}
        )
        sample_ids.append(sample_id)

        if sample.annotations:
            await db_client.insert(
                "annotations",
                sample.annotations[0],
                ids={
                    "project_id": ObjectId(project_id),
                    "sample_id": ObjectId(sample_id),
                },
            )

    model_id_1 = await db_client.insert(
        "models", db_definitions.MODEL_1, ids={"project_id": ObjectId(project_id)}
    )

    model_id_2 = await db_client.insert(
        "models", db_definitions.MODEL_2, ids={"project_id": ObjectId(project_id)}
    )

    model_id_3 = await db_client.insert(
        "models",
        db_definitions.MODEL_3,
        ids={"project_id": ObjectId(project_id)},
    )

    model_id_4 = await db_client.insert(
        "models", db_definitions.MODEL_4, ids={"project_id": ObjectId(project_id)}
    )

    # Create temp files for each
    for _id in (model_id_1, model_id_2, model_id_3, model_id_4):
        config.settings.models.cache_dir.joinpath(f"{_id}.model").touch()
    yield {
        "project_id": project_id,
        "sample_ids": sample_ids,
        "model_id_1": model_id_1,
        "model_id_2": model_id_2,
        "model_id_3": model_id_3,
        "model_id_4": model_id_4,
    }
