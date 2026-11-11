import pytest
from toktagger.api import config
from toktagger.api.core.data_loaders import DataLoader, LoaderRegistry
from toktagger.api.schemas.samples import ShotData


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
@pytest.mark.parametrize("loader", ["uda", "sal", "fair_mast", "tabular"])
async def test_get_signal_name_help(api_client, setup_db, loader):
    response = await api_client.get(f"/meta/dataloader/{loader}/help")
    assert response.status_code == 200
    assert response.json() == LoaderRegistry.get(loader).signal_name_help


@pytest.mark.asyncio
async def test_get_signal_name_help_custom_loader(api_client, setup_db):
    @LoaderRegistry.register("custom_help_test")
    class CustomHelpLoader(DataLoader):
        signal_name_help = "Custom help text."

        @classmethod
        def sample_data_type(cls) -> type[ShotData]:
            return ShotData

        def get_sample(self, sample, params=None, **kwargs):
            raise NotImplementedError

    @LoaderRegistry.register("custom_no_help_test")
    class CustomNoHelpLoader(CustomHelpLoader):
        signal_name_help = None

    try:
        response = await api_client.get("/meta/dataloader/custom_help_test/help")
        assert response.status_code == 200
        assert response.json() == "Custom help text."

        response = await api_client.get("/meta/dataloader/custom_no_help_test/help")
        assert response.status_code == 200
        assert response.json() is None
    finally:
        LoaderRegistry._registry.pop("custom_help_test")
        LoaderRegistry._registry.pop("custom_no_help_test")


@pytest.mark.asyncio
@pytest.mark.models_enabled
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
@pytest.mark.models_enabled
@pytest.mark.parametrize("local", [True, False])
@pytest.mark.parametrize("gitlab", [True, False])
@pytest.mark.parametrize("hugging_face", [True, False])
async def test_get_model_load_methods(
    api_client, setup_db, local, gitlab, hugging_face
):
    expected_methods = ["local", "gitlab", "hugging_face"]
    if not local:
        config.settings.models.local_load_enabled = False
        expected_methods.remove("local")
    if not gitlab:
        config.settings.models.gitlab_load_enabled = False
        expected_methods.remove("gitlab")
    if not hugging_face:
        config.settings.models.huggingface_load_enabled = False
        expected_methods.remove("hugging_face")

    response = await api_client.get("/meta/models/load")
    config.settings.models.local_load_enabled = True  # Restore default settings
    config.settings.models.huggingface_load_enabled = True
    config.settings.models.gitlab_load_enabled = True

    assert response.status_code == 200
    data = response.json()
    assert data == expected_methods


@pytest.mark.asyncio
@pytest.mark.models_enabled
@pytest.mark.parametrize(
    "model_name", ["mock_timeseries_cnn", "mock_params_timeseries_cnn"]
)
@pytest.mark.parametrize("method", ["train", "predict"])
async def test_get_model_schema(api_client, setup_db, model_name, method):
    response = await api_client.get(f"/meta/models/{model_name}/{method}")

    assert response.status_code == 200
    data = response.json()

    if model_name == "mock_timeseries_cnn":
        assert not data
    else:
        assert data["title"] == "TimeSeriesCNNParams"
        assert data["properties"]["final_score"]["type"] == "integer"
        assert data["properties"]["final_score"]["minimum"] == 50
        assert data["properties"]["final_score"]["exclusiveMaximum"] == 100
        assert data["properties"]["test_string"]["type"] == "string"
        assert data["properties"]["test_bool"]["type"] == "boolean"
        assert data["properties"]["test_bool"]["default"]  # == True
        assert data["properties"]["test_selection"]["enum"] == [
            "selection_1",
            "selection_2",
        ]


@pytest.mark.asyncio
@pytest.mark.models_disabled
@pytest.mark.parametrize("task", ["time-series", "video"])
async def test_get_model_types_disabled(api_client, setup_db, task):
    response = await api_client.get(f"/meta/models?task={task}")
    assert response.status_code == 503
    data = response.json()
    assert (
        "ML model features are disabled (optional dependencies missing)"
        in data["detail"]
    )


@pytest.mark.asyncio
@pytest.mark.models_disabled
@pytest.mark.parametrize("local", [True, False])
async def test_get_model_load_methods_disabled(api_client, setup_db, local):
    if not local:
        config.settings.models.local_load_enabled = False
    response = await api_client.get("/meta/models/load")
    config.settings.models.local_load_enabled = True
    assert response.status_code == 503
    data = response.json()
    assert (
        "ML model features are disabled (optional dependencies missing)"
        in data["detail"]
    )


@pytest.mark.asyncio
@pytest.mark.models_disabled
@pytest.mark.parametrize(
    "model_name", ["mock_timeseries_cnn", "mock_params_timeseries_cnn"]
)
@pytest.mark.parametrize("method", ["train", "predict"])
async def test_get_model_schema_disabled(api_client, setup_db, model_name, method):
    response = await api_client.get(f"/meta/models/{model_name}/{method}")

    assert response.status_code == 503
    data = response.json()
    assert (
        "ML model features are disabled (optional dependencies missing)"
        in data["detail"]
    )
