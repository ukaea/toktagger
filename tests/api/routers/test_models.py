import pytest
import pytest_asyncio
import tempfile
import random
import numpy
import pandas as pd
import pathlib
from services.api.schemas.projects import ProjectIn
from services.api.schemas.samples import SampleIn, TimeSeriesFileData
from services.api.schemas.annotations import TimePoint
from services.api.schemas.models import ModelIn
from unittest.mock import patch
from bson import ObjectId
from services.api.models.base import Model

import os
import ray


@ray.remote
class DisruptionCNN(Model):
    def define_model(self):
        return None

    def train(self, samples, annotations, *args, **kwargs):
        pass

    def predict(self, samples, *args, **kwargs):
        return [
            [
                TimePoint(
                    validated=False,
                    uncertainty=random.random(),
                    label=self.id,
                    time=random.randint(80, 120),
                    created_by=self.type,
                )
            ]
            for i in range(len(samples))
        ]

    def save(self, file_path):
        pass

    def load(self, project, file_path):
        pass


async def post_to_url(api_client, url):
    """
    Perform a POST to a URL with the test API client.

    Catch any response which is sent from the worker to the server via the API,
    and use the test API client to send it (this is needed due to a sync / async mismatch in the tests)

    Note that ray is in local mode, which means everything is executed in a single thread.
    This means tasks are executed in serial, and there is no need to wait for the model to complete predictions.
    """
    RESULTS = {}

    def send_updates(url: str, updates: list):
        payload = [model.model_dump(mode="json") for model in updates]
        RESULTS[url] = payload

    with patch("services.api.core.sender.send_batch_updates", send_updates):
        response = await api_client.post(url)
        # Check you get a 200 response
        assert response.status_code == 200

    # Push results to server via API endpoints which predict task uses
    # This is a fudge since that uses sync requests module, whereas this is an Async test client
    for put_url, payload in RESULTS.items():
        await api_client.put(put_url, json=payload)


@pytest_asyncio.fixture(scope="function")
async def setup_model_db(db_client):
    os.environ["MODEL_STORAGE"] = "Test"
    # Create sample data for training / predicting a Disruption model
    project = ProjectIn(
        name="Test", task="disruption", query_strategy="random", data_loader="parquet"
    )
    project_id = await db_client.insert("projects", project)
    sample_ids = []
    with tempfile.TemporaryDirectory() as tempd:
        for i in range(20):
            # Generate sample data
            disruption_time = random.randint(80, 120)
            data = numpy.concatenate(
                (
                    numpy.random.uniform(10, 12, disruption_time),
                    numpy.random.uniform(15, 50, 2),
                    numpy.zeros(150 - (disruption_time + 2)),
                )
            )
            df = pd.DataFrame({"ip": data})
            filename = pathlib.Path(tempd).joinpath(f"{i}.parquet")
            df.to_parquet(filename)

            annotation = TimePoint(
                validated=True, label="Disruption", time=disruption_time
            )

            sample = SampleIn(
                shot_id=i,
                data=TimeSeriesFileData(
                    file_name=str(filename),
                    type="parquet",
                ),
                annotations=[annotation] if i < 10 else None,
            )
            sample_id = await db_client.insert(
                "samples", sample, ids={"project_id": ObjectId(project_id)}
            )
            sample_ids.append(sample_id)

            if i < 10:
                await db_client.insert(
                    "annotations",
                    annotation,
                    ids={
                        "project_id": ObjectId(project_id),
                        "sample_id": ObjectId(sample_ids[i]),
                    },
                )
        model_1 = ModelIn(
            type="disruption_cnn",
            version=1,
            training_status="completed",
            progress=100,
            score=80,
        )
        model_id_1 = await db_client.insert(
            "models", model_1, ids={"project_id": ObjectId(project_id)}
        )
        model_2 = ModelIn(
            type="disruption_cnn",
            version=2,
            training_status="completed",
            progress=100,
            score=90,
        )
        model_id_2 = await db_client.insert(
            "models", model_2, ids={"project_id": ObjectId(project_id)}
        )

        yield {
            "project_id": project_id,
            "sample_ids": sample_ids,
            "model_id_1": model_id_1,
            "model_id_2": model_id_2,
        }


@pytest.mark.asyncio
@patch.dict("services.api.models.registry.MODELS", {"disruption_cnn": DisruptionCNN})
async def test_model_batch_predict_num_predictions(
    api_client, db_client, setup_model_db
):
    await post_to_url(
        api_client=api_client,
        url=f"/projects/{setup_model_db['project_id']}/models/disruption_cnn/predict?num_predictions=5",
    )

    # Get annotations from the database, there should be 5 non validated ones
    annotations = await db_client.get_filtered_documents(
        collection="annotations", filters={"validated": False}
    )
    assert len(annotations) == 5

    # Check latest version of model has been used by default (annotation label set to model ID in Mock)
    assert all(ann["label"] == setup_model_db["model_id_2"] for ann in annotations)


@pytest.mark.asyncio
@patch.dict("services.api.models.registry.MODELS", {"disruption_cnn": DisruptionCNN})
async def test_model_batch_predict_samples(api_client, db_client, setup_model_db):
    query_string = "&".join(
        f"sample_ids={id}" for id in setup_model_db["sample_ids"][:2]
    )
    await post_to_url(
        api_client=api_client,
        url=f"/projects/{setup_model_db['project_id']}/models/disruption_cnn/predict?{query_string}",
    )

    # Get annotations from the database, there should be 2 non validated ones
    annotations = await db_client.get_filtered_documents(
        collection="annotations", filters={"validated": False}
    )
    assert len(annotations) == 2

    # Check annotations assocaited with correct samples were updated
    assert sorted(
        [str(annotation["sample_id"]) for annotation in annotations]
    ) == sorted(setup_model_db["sample_ids"][:2])

    # Check latest version of model has been used by default (annotation label set to model ID in Mock)
    assert all(ann["label"] == setup_model_db["model_id_2"] for ann in annotations)


@pytest.mark.asyncio
@patch.dict("services.api.models.registry.MODELS", {"disruption_cnn": DisruptionCNN})
async def test_model_batch_predict_version(api_client, db_client, setup_model_db):
    await post_to_url(
        api_client=api_client,
        url=f"/projects/{setup_model_db['project_id']}/models/disruption_cnn/predict?num_predictions=5&version=1",
    )

    # Get annotations from the database, there should be 5 non validated ones
    annotations = await db_client.get_filtered_documents(
        collection="annotations", filters={"validated": False}
    )
    assert len(annotations) == 5

    # Check version 1 of model has been used (annotation label set to model ID in Mock)
    assert all(ann["label"] == setup_model_db["model_id_1"] for ann in annotations)


@pytest.mark.asyncio
@patch.dict("services.api.models.registry.MODELS", {"disruption_cnn": DisruptionCNN})
async def test_model_sample_predict(api_client, db_client, setup_model_db):
    await post_to_url(
        api_client=api_client,
        url=f"/projects/{setup_model_db['project_id']}/samples/{setup_model_db['sample_ids'][-1]}/models/disruption_cnn/predict",
    )

    # Get annotations from the database, there should be 1 non validated one
    annotations = await db_client.get_filtered_documents(
        collection="annotations", filters={"validated": False}
    )
    assert len(annotations) == 1

    # Check latest version of model has been used (annotation label set to model ID in Mock)
    assert annotations[0]["label"] == setup_model_db["model_id_2"]

    # Check it corresponds to sample ID we asked for predictions on
    assert str(annotations[0]["sample_id"]) == setup_model_db["sample_ids"][-1]
