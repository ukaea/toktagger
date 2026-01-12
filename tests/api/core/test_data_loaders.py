import toktagger.api.core.data_loaders as data_loaders
import pytest
from toktagger.api.schemas.projects import Task
from typing import Type
from toktagger.api.schemas.samples import (
    Sample,
    FileData,
    TimeSeriesFileData,
    ShotData,
)
from toktagger.api.schemas.data import (
    TimeSeriesData,
    MultiVariateTimeSeriesData,
    ImageData,
    ImageParams,
    DataParams,
)
import pathlib
import numpy
from PIL import Image
import base64
import io


def test_image_file_loader_jpg():
    img_file = FileData(
        file_name=str(pathlib.Path(__file__).parents[2].joinpath("mast_images")),
        type="jpg",
        protocol="file",
    )
    sample = Sample(
        shot_id=10000,
        data=img_file,
        _id="test",
        project_id="test",
        validated_annotations=False,
    )
    data_loader = data_loaders.ImageDataLoader(
        params=ImageParams(name="image", frame=1)
    )
    image_data = data_loader.get_sample(sample)
    assert isinstance(image_data, ImageData)
    # Check we got back base64 encoded string
    assert isinstance(image_data.values, str)
    # Convert back to numpy array
    base64_decoded = base64.b64decode(image_data.values)
    image = Image.open(io.BytesIO(base64_decoded))
    assert numpy.array(image).shape == (1079, 881, 3)


def test_image_file_loader_png():
    img_file = FileData(
        file_name=str(pathlib.Path(__file__).parents[2].joinpath("mast_images")),
        type="png",
        protocol="file",
    )
    sample = Sample(
        shot_id=10000,
        data=img_file,
        _id="test",
        project_id="test",
        validated_annotations=False,
    )
    data_loader = data_loaders.ImageDataLoader(
        params=ImageParams(name="image", frame=1)
    )
    image_data = data_loader.get_sample(sample)
    assert isinstance(image_data, ImageData)
    # Check we got back base64 encoded string
    assert isinstance(image_data.values, str)
    # Convert back to numpy array
    base64_decoded = base64.b64decode(image_data.values)
    image = Image.open(io.BytesIO(base64_decoded))
    assert numpy.array(image).shape == (1079, 881, 3)


def test_parquet_file_loader():
    parquet_file = TimeSeriesFileData(
        file_name=str(pathlib.Path(__file__).parents[2].joinpath("test.parquet")),
        type="parquet",
        protocol="file",
        column_names=["Ip", "dalpha"],
    )
    sample = Sample(
        shot_id=10000,
        data=parquet_file,
        _id="test",
        project_id="test",
        validated_annotations=False,
    )
    data_loader = data_loaders.ParquetDataLoader(params=DataParams(name="identity"))
    data = data_loader.get_sample(sample)
    assert isinstance(data, MultiVariateTimeSeriesData)

    # Check both columns requested are present
    assert data.values.get("Ip")
    assert data.values.get("dalpha")

    # Check values - dalpha should be between 0 and 50
    dalpha_values = numpy.array(data.values.get("dalpha").values)
    ip_values = numpy.array(data.values.get("Ip").values)
    assert numpy.all((dalpha_values >= 0) & (dalpha_values <= 50))

    # Ip should have 4 values of 1000
    assert len(numpy.where(numpy.isclose(ip_values, 1000))[0]) == 4


def test_uda_loader(uda_env_vars):
    try:
        import pyuda

        pyuda.Client().get("help::help()")
    except Exception:
        pytest.skip("Could not contact UDA server")

    uda_shot = ShotData(protocol="uda", signal_names=["ip", "ANE_DENSITY"])
    sample = Sample(
        shot_id=14892,
        data=uda_shot,
        _id="test",
        project_id="test",
        validated_annotations=False,
    )
    data_loader = data_loaders.UDADataLoader(params=DataParams(name="identity"))
    data = data_loader.get_sample(sample)
    assert isinstance(data, MultiVariateTimeSeriesData)

    # Check both columns requested are present
    assert data.values.get("ip")
    assert data.values.get("ANE_DENSITY")

    # Check it contains values and times
    ip_values = numpy.array(data.values.get("ip").values)
    times = numpy.array(data.values.get("ip").time)
    assert numpy.all((ip_values >= -50) & (ip_values <= 1000))
    assert numpy.max(times) < 1.5


def test_uda_loader_data_doesnt_exist(uda_env_vars):
    try:
        import pyuda

        pyuda.Client().get("help::help()")
    except Exception:
        pytest.skip("Could not contact UDA server")

    uda_shot = ShotData(protocol="uda", signal_names=["doesnt_exist"])
    sample = Sample(
        shot_id=10000,
        data=uda_shot,
        _id="test",
        project_id="test",
        validated_annotations=False,
    )
    data_loader = data_loaders.UDADataLoader(params=DataParams(name="identity"))
    data = data_loader.get_sample(sample)
    assert isinstance(data, MultiVariateTimeSeriesData)

    # Check both columns requested are present, but filled with Nones
    assert data.values["doesnt_exist"] is None


@pytest.mark.asyncio
async def test_custom_data_loader(api_client):
    # Check that you cannot create a project with 'test' data loader
    in_project = {
        "name": "test_project",
        "task": Task.VIDEO,
        "query_strategy": "random",
        "data_loader": "test",  # <--- invalid
    }
    response = await api_client.post("/projects", json=in_project)
    assert response.status_code == 422
    assert "Invalid data loader 'test'" in response.json()["detail"][0]["msg"]

    # Create a custom data loader
    @data_loaders.LoaderRegistry.register("test")
    class CustomLoader(data_loaders.DataLoader):
        @classmethod
        def sample_data_type(self) -> Type[ShotData]:
            return ShotData

        def get_sample(self, sample: Sample, **kwargs):
            shot_id = sample.shot_id
            # Return some data, use something from sample to check it is passed in correctly
            return MultiVariateTimeSeriesData(
                values={
                    "test_vals": TimeSeriesData(
                        time=[0, 1], values=[shot_id, shot_id + 1]
                    )
                }
            )

    # Try again to create project with test dataloader, should be valid now
    response = await api_client.post("/projects", json=in_project)
    assert response.status_code == 200
    _project_id = response.json()["_id"]

    # Now create a sample, contents dont matter
    shot_id = 10
    in_sample = [
        {
            "shot_id": shot_id,
            "data": {
                "protocol": "uda",
                "signal_names": ["Ip", "dalpha"],
            },
        },
    ]
    response = await api_client.post(f"/projects/{_project_id}/samples", json=in_sample)
    assert response.status_code == 200
    _sample_id = response.json()[0]

    # And get data from that sample, should use new data loader
    response = await api_client.post(
        f"/projects/{_project_id}/samples/{_sample_id}/data"
    )
    assert response.status_code == 200
    assert response.json()["values"]["test_vals"]["time"] == [0, 1]
    assert response.json()["values"]["test_vals"]["values"] == [shot_id, shot_id + 1]


@pytest.mark.parametrize(
    "name,data_loader,sample_data_model",
    [
        ("image", data_loaders.ImageDataLoader, FileData),
        ("parquet", data_loaders.ParquetDataLoader, TimeSeriesFileData),
        ("uda", data_loaders.UDADataLoader, ShotData),
    ],
)
def test_loader_registry(name, data_loader, sample_data_model):
    # Check the registry returns the correct class
    assert data_loaders.LoaderRegistry.get(name) == data_loader

    # Check the registry returns the correct sample data schema
    assert (
        data_loaders.LoaderRegistry.get_data_schema(name)
        == sample_data_model.model_json_schema()
    )
