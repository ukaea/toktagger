import pytest
from toktagger.api.schemas.samples import ShotData
import os


@pytest.mark.asyncio
async def test_get_data_loaders(api_client, setup_db):
    response = await api_client.get("/meta/dataloader")
    assert response.status_code == 200
    data = response.json()
    assert all(item in data for item in ("uda", "image", "tabular", "sal", "fair_mast"))


@pytest.mark.asyncio
async def test_get_data_schema(api_client, setup_db):
    response = await api_client.get("/meta/dataloader/uda")
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "ShotData"
    assert data == ShotData.model_json_schema()


@pytest.mark.asyncio
@pytest.mark.parametrize("task", ["time-series", "video"])
async def test_get_model_types(api_client, setup_db, task):
    response = await api_client.get(f"/meta/models?task={task}")
    assert response.status_code == 200

    data = response.json()
    models_present = (
        item in data
        for item in [
            "mock_timeseries_cnn",
            "mock_params_timeseries_cnn",
            "mock_disruption_cnn",
        ]
    )
    if task == "time-series":
        assert all(models_present)
    else:
        assert not any(models_present)


@pytest.mark.asyncio
@pytest.mark.parametrize("local", [True, False])
async def test_get_model_load_methods(api_client, setup_db, local):
    if not local:
        os.environ["DISABLE_LOCAL_MODEL_LOAD"] = "true"
    response = await api_client.get("/meta/models/load")
    if not local:
        os.environ.pop("DISABLE_LOCAL_MODEL_LOAD")
    assert response.status_code == 200
    data = response.json()
    if local:
        assert data == ["local"]
    else:
        assert data == []
