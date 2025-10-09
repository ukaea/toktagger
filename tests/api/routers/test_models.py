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
from services.api.models.disruption import DisruptionCNN
import os


def return_predictions(self, samples, *args, **kwargs):
    print("Inside mock")
    return [
        [
            TimePoint(
                validated=False,
                uncertainty=random.random(),
                label="Disruption",
                time=random.randint(80, 120),
                created_by=self.type,
            )
        ]
        for i in range(len(samples))
    ]


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
        model = ModelIn(
            type="disruption_cnn",
            version=1,
            training_status="completed",
            progress=100,
            score=80,
        )
        model_id = await db_client.insert(
            "models", model, ids={"project_id": ObjectId(project_id)}
        )

        yield {"project_id": project_id, "sample_ids": sample_ids, "model_id": model_id}


@pytest.mark.asyncio
@patch.object(DisruptionCNN, "predict", return_predictions)
@patch.object(DisruptionCNN, "predict", return_predictions)
async def test_model_batch_predict_num_predictions(
    api_client, db_client, setup_model_db
):
    RESULTS = {}

    def send_updates(url: str, updates: list):
        payload = [model.model_dump(mode="json") for model in updates]
        RESULTS[url] = payload

    with patch("services.api.core.sender.send_batch_updates", send_updates):
        response = await api_client.post(
            f"/projects/{setup_model_db['project_id']}/models/disruption_cnn/predict?num_predictions=5",
        )
        # Check you get a 200 response
        assert response.status_code == 200

    # Push results to server via API endpoints which predict task uses
    # This is a fudge since that uses sync requests module, whereas this is an Async test client
    for url, payload in RESULTS.items():
        await api_client.put(url, json=payload)

    # Get annotations from the database, there should be 5 non validated ones
    annotations = await db_client.get_filtered_documents(
        collection="annotations", filters={"validated": False}
    )
    assert len(annotations) == 5


@pytest.mark.asyncio
@patch.object(DisruptionCNN, "predict", return_predictions)
@patch.object(DisruptionCNN, "predict", return_predictions)
async def test_model_batch_predict_samples(api_client, db_client, setup_model_db):
    RESULTS = {}

    def send_updates(url: str, updates: list):
        payload = [model.model_dump(mode="json") for model in updates]
        RESULTS[url] = payload

    with patch("services.api.core.sender.send_batch_updates", send_updates):
        query_string = "&".join(
            f"sample_ids={id}" for id in setup_model_db["sample_ids"][:2]
        )

        response = await api_client.post(
            f"/projects/{setup_model_db['project_id']}/models/disruption_cnn/predict?{query_string}",
        )
        # Check you get a 200 response
        assert response.status_code == 200

    # Push results to server via API endpoints which predict task uses
    # This is a fudge since that uses sync requests module, whereas this is an Async test client
    for url, payload in RESULTS.items():
        await api_client.put(url, json=payload)

    # Get annotations from the database, there should be 2 non validated ones
    annotations = await db_client.get_filtered_documents(
        collection="annotations", filters={"validated": False}
    )
    assert len(annotations) == 2

    # Check annotations assocaited with correct samples were updated
    assert sorted(
        [str(annotation["sample_id"]) for annotation in annotations]
    ) == sorted(setup_model_db["sample_ids"][:2])
