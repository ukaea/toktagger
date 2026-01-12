import pytest
import pytest_asyncio
import random
import pathlib
from toktagger.api.schemas.projects import ProjectIn, Task
from toktagger.api.schemas.samples import SampleIn, TimeSeriesFileData
from toktagger.api.schemas.annotations import TimePoint
from toktagger.api.schemas.models import ModelUpdate
from tests.db_definitions import MODEL_1, MODEL_2
from unittest.mock import patch
from bson import ObjectId
import os


async def send_to_url(api_client, url, method):
    """
    Perform a POST or PUT to a URL with the test API client.

    Catch any response which is sent from the worker to the server via the API,
    and use the test API client to send it (this is needed due to a sync / async mismatch in the tests)

    Note that ray is in local mode, which means everything is executed in a single thread.
    This means tasks are executed in serial, and there is no need to wait for the model to complete predictions.
    """
    RESULTS = {}

    def mock_send_updates(object_type: str, url: str, updates: list):
        if isinstance(updates, list):
            payload = [model.model_dump(mode="json") for model in updates]
        else:
            payload = updates.model_dump(mode="json")
        payloads = RESULTS.get(url, [])
        payloads.append(payload)
        RESULTS[url] = payloads

    with patch("toktagger.api.core.sender.send_updates", mock_send_updates):
        if method == "POST":
            response = await api_client.post(url)
        else:
            response = await api_client.put(url)
            # Check you get a 200 response
            assert response.status_code == 200

    # Push results to server via API endpoints which predict task uses
    # This is a fudge since that uses sync requests module, whereas this is an Async test client
    for put_url, payloads in RESULTS.items():
        for payload in payloads:
            await api_client.put(put_url, json=payload)

    return response.json(), RESULTS


@pytest_asyncio.fixture(scope="function")
async def setup_model_db(db_client):
    # Create sample data for training / predicting a Disruption model
    project = ProjectIn(
        name="Test",
        task=Task.TIME_SERIES,
        query_strategy="random",
        data_loader="parquet",
    )
    project_id = await db_client.insert("projects", project)
    sample_ids = []
    for i in range(20):
        # Generate sample data
        disruption_time = random.randint(80, 120)
        annotation = TimePoint(
            validated=True,
            label="Disruption",
            time=disruption_time,
            created_by="manual" if i < 5 else "disruption_cnn",
        )

        sample = SampleIn(
            shot_id=i,
            data=TimeSeriesFileData(
                file_name=f"{i}.parquet",
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

    model_id_1 = await db_client.insert(
        "models", MODEL_1, ids={"project_id": ObjectId(project_id)}
    )

    model_id_2 = await db_client.insert(
        "models", MODEL_2, ids={"project_id": ObjectId(project_id)}
    )

    yield {
        "project_id": project_id,
        "sample_ids": sample_ids,
        "model_id_1": model_id_1,
        "model_id_2": model_id_2,
    }


KILL_COUNT = 0


def mock_wait(*args, **kwargs):
    return [], ["waiting"]


def kill(*args, **kwargs):
    print("killed")


@pytest.mark.asyncio
async def test_model_batch_predict_num_predictions(
    api_client, db_client, setup_model_db
):
    await send_to_url(
        api_client=api_client,
        url=f"/projects/{setup_model_db['project_id']}/models/mock_disruption_cnn/predict?num_predictions=5",
        method="POST",
    )

    # Get annotations from the database, there should be 5 non validated ones
    annotations = await db_client.get_filtered_documents(
        collection="annotations", filters={"validated": False}
    )
    assert len(annotations) == 5

    # Check latest version of model has been used by default (annotation label set to model ID in Mock)
    assert all(ann["label"] == setup_model_db["model_id_2"] for ann in annotations)


@pytest.mark.asyncio
async def test_model_batch_predict_samples(api_client, db_client, setup_model_db):
    query_string = "&".join(
        f"sample_ids={id}" for id in setup_model_db["sample_ids"][:2]
    )
    await send_to_url(
        api_client=api_client,
        url=f"/projects/{setup_model_db['project_id']}/models/mock_disruption_cnn/predict?{query_string}",
        method="POST",
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
async def test_model_batch_predict_version(api_client, db_client, setup_model_db):
    await send_to_url(
        api_client=api_client,
        url=f"/projects/{setup_model_db['project_id']}/models/mock_disruption_cnn/predict?num_predictions=5&version=1",
        method="POST",
    )

    # Get annotations from the database, there should be 5 non validated ones
    annotations = await db_client.get_filtered_documents(
        collection="annotations", filters={"validated": False}
    )
    assert len(annotations) == 5

    # Check version 1 of model has been used (annotation label set to model ID in Mock)
    assert all(ann["label"] == setup_model_db["model_id_1"] for ann in annotations)


@pytest.mark.asyncio
async def test_model_sample_predict(api_client, db_client, setup_model_db):
    await send_to_url(
        api_client=api_client,
        url=f"/projects/{setup_model_db['project_id']}/samples/{setup_model_db['sample_ids'][-1]}/models/mock_disruption_cnn/predict",
        method="POST",
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


@pytest.mark.asyncio
async def test_model_get_sample_prediction(api_client, db_client, setup_model_db):
    prediction_response, _ = await send_to_url(
        api_client=api_client,
        url=f"/projects/{setup_model_db['project_id']}/samples/{setup_model_db['sample_ids'][-1]}/models/mock_disruption_cnn/predict",
        method="POST",
    )
    task_id = prediction_response["task_id"]

    get_response = await api_client.get(
        f"/projects/{setup_model_db['project_id']}/samples/{setup_model_db['sample_ids'][-1]}/models/mock_disruption_cnn/predict/{task_id}"
    )
    assert get_response.status_code == 200

    # Get annotation from the database
    annotations = await db_client.get_filtered_documents(
        collection="annotations", filters={"validated": False}
    )
    annotation = annotations[0]
    # Check it corresponds to sample ID we asked for predictions on
    assert str(annotation["sample_id"]) == setup_model_db["sample_ids"][-1]

    # Check it is the same as the one returned to us via API
    returned_annotation = get_response.json()[0]

    for key in ("validated", "uncertainty", "label", "created_by", "time"):
        assert annotation[key] == returned_annotation[key]


@pytest.mark.asyncio
async def test_model_get_sample_prediction_invalid_task(
    api_client, db_client, setup_model_db
):
    # Ask for predictions from a task which doesn't exist
    get_response = await api_client.get(
        f"/projects/{setup_model_db['project_id']}/samples/{setup_model_db['sample_ids'][-1]}/models/mock_disruption_cnn/predict/invalid_id"
    )

    # Check it returns 404 with appropriate message
    assert get_response.status_code == 404
    assert "Predict task not found with that ID!" in get_response.json()["detail"]


@pytest.mark.asyncio
async def test_model_get_sample_prediction_wrong_sample(
    api_client, db_client, setup_model_db
):
    prediction_response, _ = await send_to_url(
        api_client=api_client,
        url=f"/projects/{setup_model_db['project_id']}/samples/{setup_model_db['sample_ids'][-1]}/models/mock_disruption_cnn/predict",
        method="POST",
    )
    task_id = prediction_response["task_id"]

    # Ask for predictions from this task for a sample which we did not predict on
    get_response = await api_client.get(
        f"/projects/{setup_model_db['project_id']}/samples/{setup_model_db['sample_ids'][-2]}/models/mock_disruption_cnn/predict/{task_id}"
    )

    # Check it returns 404 with appropriate message
    assert get_response.status_code == 404
    assert (
        "This task does not have results for the specified sample!"
        in get_response.json()["detail"]
    )


@pytest.mark.asyncio
@patch("ray.wait", mock_wait)
async def test_model_get_sample_prediction_in_progress(
    api_client, db_client, setup_model_db
):
    prediction_response, _ = await send_to_url(
        api_client=api_client,
        url=f"/projects/{setup_model_db['project_id']}/samples/{setup_model_db['sample_ids'][-1]}/models/mock_disruption_cnn/predict",
        method="POST",
    )
    task_id = prediction_response["task_id"]

    # Ask for predictions from this task for a sample while it is still in progress
    get_response = await api_client.get(
        f"/projects/{setup_model_db['project_id']}/samples/{setup_model_db['sample_ids'][-1]}/models/mock_disruption_cnn/predict/{task_id}"
    )

    # Check it returns 202 with appropriate message
    assert get_response.status_code == 202
    assert "Predict task in the queue!" in get_response.json()["message"]


@pytest.mark.asyncio
async def test_model_update(api_client, db_client, setup_model_db):
    model_updates = ModelUpdate(training_status="started", progress=50, score=20)
    response = await api_client.put(
        f"/projects/{setup_model_db['project_id']}/models/{setup_model_db['model_id_1']}",
        json=model_updates.model_dump(mode="json"),
    )
    assert response.status_code == 200

    # Get model from the database
    model = await db_client.get_document_by_id(
        collection="models", object_id=ObjectId(setup_model_db["model_id_1"])
    )
    assert model["training_status"] == "started"
    assert model["progress"] == 50
    assert model["score"] == 20


@pytest.mark.asyncio
async def test_model_start_training(api_client, db_client, setup_model_db):
    response, model_updates = await send_to_url(
        api_client=api_client,
        url=f"/projects/{setup_model_db['project_id']}/models/mock_disruption_cnn/train",
        method="PUT",
    )

    # Check model has been set to
    #   - Started, with 0% completion
    #   - Started, with 50% completion (inside mock train method)
    #   - Completed, with 100% completion (outside train method)
    url, updates = next(iter(model_updates.items()))
    model_id = url.split("/")[-1]
    assert updates[0]["training_status"] == "started"
    assert updates[0]["progress"] == 0

    assert updates[1]["training_status"] == "started"
    assert updates[1]["progress"] == 50
    assert updates[1]["score"] == 20

    assert updates[2]["training_status"] == "completed"
    assert updates[2]["progress"] == 100
    assert updates[2]["score"] == 60  # value returned by train method

    # Check model has been saved after completion
    assert (
        pathlib.Path(os.environ["MODEL_STORAGE"]).joinpath(f"{model_id}.model").exists()
    )


# Test delete model
@pytest.mark.asyncio
async def test_model_delete_type(api_client, db_client, setup_db):
    response = await api_client.delete(
        f"/projects/{setup_db['project_id_1']}/models/mock_disruption_cnn"
    )
    assert response.status_code == 200

    # Check there is one model left in the database
    models = await db_client.get_all_documents("models")
    assert len(models) == 1

    # Check it is not of type 'mock_disruption_cnn'
    assert models[0]["type"] != "mock_disruption_cnn"

    # Check for models 1 and 2, their file no longer exists
    assert (
        not pathlib.Path(os.environ["MODEL_STORAGE"])
        .joinpath(f"{setup_db['model_id_1']}.model")
        .exists()
    )
    assert (
        not pathlib.Path(os.environ["MODEL_STORAGE"])
        .joinpath(f"{setup_db['model_id_2']}.model")
        .exists()
    )
    # And for model 3 it does still exist
    assert (
        pathlib.Path(os.environ["MODEL_STORAGE"])
        .joinpath(f"{setup_db['model_id_3']}.model")
        .exists()
    )


@pytest.mark.asyncio
async def test_model_delete_type_version(api_client, db_client, setup_db):
    response = await api_client.delete(
        f"/projects/{setup_db['project_id_1']}/models/mock_disruption_cnn?version=2"
    )
    assert response.status_code == 200

    # Check there is one model left in the database
    models = await db_client.get_all_documents("models")
    assert len(models) == 2
    # Check model version 1 of mock_disruption_cnn still exists
    assert models[0]["type"] == "mock_disruption_cnn" and models[0]["version"] == 1
    # Check the other one is type 'disruption_cnn'
    assert models[1]["type"] == "disruption_cnn"

    # Check for model 2, their file no longer exists
    assert (
        not pathlib.Path(os.environ["MODEL_STORAGE"])
        .joinpath(f"{setup_db['model_id_2']}.model")
        .exists()
    )
    # And for models 1 and 3 it does still exist
    assert (
        pathlib.Path(os.environ["MODEL_STORAGE"])
        .joinpath(f"{setup_db['model_id_1']}.model")
        .exists()
    )
    assert (
        pathlib.Path(os.environ["MODEL_STORAGE"])
        .joinpath(f"{setup_db['model_id_3']}.model")
        .exists()
    )


@pytest.mark.asyncio
@patch("ray.kill")
async def test_model_stop_training(mock_func, api_client, db_client, setup_db):
    response = await api_client.delete(
        f"/projects/{setup_db['project_id_1']}/models/disruption_cnn/train"
    )
    assert response.status_code == 200
    assert len(response.json()) == 1
    deleted_id = response.json()[0]
    assert deleted_id == setup_db["model_id_3"]

    # Check it is aborted in database
    models = await db_client.get_filtered_documents(
        "models", {"type": "disruption_cnn"}
    )
    model = models[0]
    assert model["training_status"] == "aborted"

    assert mock_func.call_count > 0


@pytest.mark.asyncio
@patch("ray.kill")
async def test_model_stop_training_not_in_progress(
    mock_func, api_client, db_client, setup_db
):
    response = await api_client.delete(
        f"/projects/{setup_db['project_id_1']}/models/mock_disruption_cnn/train?version=1"
    )
    assert response.status_code == 409
    assert (
        response.json()["detail"] == "Model training is not in progress for this model!"
    )

    # Check no models show as aborted
    models = await db_client.get_all_documents("models")
    assert all(model["training_status"] != "aborted" for model in models)

    assert mock_func.call_count == 0


@pytest.mark.asyncio
async def test_model_delete_predictions(api_client, db_client, setup_model_db):
    await api_client.delete(
        f"/projects/{setup_model_db['project_id']}/models/disruption_cnn/predict"
    )

    # Should be 5 annotations remaining since half were created by 'manual'
    annotations = await db_client.get_all_documents(collection="annotations")
    assert len(annotations) == 5
    assert all(annotation["created_by"] == "manual" for annotation in annotations)


@pytest.mark.asyncio
async def test_model_delete_no_predictions(api_client, db_client, setup_model_db):
    response = await api_client.delete(
        f"/projects/{setup_model_db['project_id']}/models/mock_disruption_cnn/predict"
    )

    # Nothing created by this model, so should return 404 and not delete anything
    assert response.status_code == 404
    assert (
        response.json()["detail"]
        == "No annotations produced by mock_disruption_cnn could be found for this Project."
    )
    annotations = await db_client.get_all_documents(collection="annotations")
    assert len(annotations) == 10
