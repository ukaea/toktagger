import pytest
import pandas as pd
import pathlib
import numpy
from PIL import Image
from bson.objectid import ObjectId
from toktagger.api.core.annotators import compute_stft
from toktagger.api.schemas.data import TimeSeriesData
from toktagger.api.schemas.projects import ProjectIn, QueryStrategyType, Task
from toktagger.api.schemas.samples import (
    SampleIn,
    ImageFileData,
    TimeSeriesFileData,
)


@pytest.mark.asyncio
async def test_get_data(api_client, setup_db):
    response = await api_client.post(
        f"/projects/{setup_db['project_id_2']}/samples/{setup_db['sample_id_4']}/data"
    )
    # Should collect data from '10000.parquet' file
    # Should only collect Ip, not dalpha
    assert response.status_code == 200
    data = response.json()
    assert data["values"].get("Ip")
    assert not data["values"].get("dalpha")
    assert data["values"]["Ip"]["time"] == list(range(100))
    # Load data from parquet, check it matches
    df = pd.read_parquet(pathlib.Path(__file__).parents[2].joinpath("10000.parquet"))
    assert data["values"]["Ip"]["values"] == df.Ip.tolist()


@pytest.mark.asyncio
async def test_get_data_summary(api_client, setup_db):
    response = await api_client.post(
        f"/projects/{setup_db['project_id_2']}/samples/{setup_db['sample_id_4']}/data/summary"
    )
    # Should collect data from '10000.parquet' file
    # Should only collect Ip, not dalpha
    assert response.status_code == 200
    data = response.json()

    assert data["type"] == "time-series"
    assert (
        data["description"]
        == "Time series signals from one or more diagnostics inside a Tokamak."
    )
    assert data["num_signals"] == 1

    assert data["signals"].get("Ip")
    assert not data["signals"].get("dalpha")

    assert data["signals"]["Ip"]["time"]["count"] == 100
    assert data["signals"]["Ip"]["time"]["min"] == 0
    assert data["signals"]["Ip"]["time"]["max"] == 99

    # Load data from parquet, check it matches
    df = pd.read_parquet(pathlib.Path(__file__).parents[2].joinpath("10000.parquet"))
    expected = df.Ip.tolist()

    assert data["signals"]["Ip"]["values"]["count"] == len(expected)
    assert data["signals"]["Ip"]["values"]["min"] == min(expected)
    assert data["signals"]["Ip"]["values"]["max"] == max(expected)
    assert data["signals"]["Ip"]["values"]["mean"] == numpy.mean(expected)


@pytest.mark.asyncio
async def test_get_data_summary_image(api_client, db_client):
    image_dir = pathlib.Path(__file__).parents[2].joinpath("mast_images")

    project_id = await db_client.insert(
        "projects",
        ProjectIn(
            name="image_test",
            task=Task.VIDEO,
            query_strategy=QueryStrategyType.SEQUENTIAL,
            data_loader="image",
        ),
    )
    sample_id = await db_client.insert(
        "samples",
        SampleIn(
            shot_id=1,
            data=ImageFileData(file_name=str(image_dir), type="png"),
            annotations=None,
        ),
        ids={"project_id": ObjectId(project_id)},
    )

    response = await api_client.post(
        f"/projects/{project_id}/samples/{sample_id}/data/summary",
        json={"params": {"name": "image", "frame": 1}},
    )
    assert response.status_code == 200
    data = response.json()

    assert data["type"] == "video"
    assert (
        data["description"]
        == "One frame from a camera diagnostic video inside a Tokamak"
    )
    assert data["num_signals"] == 1
    assert data["frame_number"] == 1

    # Load the real image to check the summary matches
    im = Image.open(image_dir.joinpath("1.png"))
    arr = numpy.array(im)
    assert data["shape"] == list(arr.shape)
    assert data["height"] == arr.shape[0]
    assert data["width"] == arr.shape[1]
    assert data["colour_mode"] == im.mode
    # Count of all pixel values, including colour channels
    assert data["count"] == arr.size
    assert data["max"] == arr.max()
    assert data["min"] == arr.min()
    assert data["mean"] == numpy.mean(arr)


@pytest.mark.asyncio
async def test_get_data_summary_profile2d(api_client, db_client):
    # The file is a time series; the profile_2d view converts the mirnov
    # signal into a 2D profile (STFT spectrogram)
    file_name = pathlib.Path(__file__).parents[2].joinpath("20000.parquet")

    project_id = await db_client.insert(
        "projects",
        ProjectIn(
            name="profile2d_test",
            task=Task.PROFILE_2D,
            query_strategy=QueryStrategyType.SEQUENTIAL,
            data_loader="tabular",
        ),
    )
    sample_id = await db_client.insert(
        "samples",
        SampleIn(
            shot_id=20000,
            data=TimeSeriesFileData(
                file_name=str(file_name),
                type="parquet",
                signal_names=["mirnov"],
            ),
            annotations=None,
        ),
        ids={"project_id": ObjectId(project_id)},
    )

    response = await api_client.post(
        f"/projects/{project_id}/samples/{sample_id}/data/summary",
        json={"view": {"name": "profile_2d", "signal_name": "mirnov"}},
    )
    assert response.status_code == 200
    data = response.json()

    assert data["type"] == "profile-2d"
    assert (
        data["description"]
        == "2D profile signal from one diagnostic inside a Tokamak (eg, spectrometer). Contains measurements of points along an axis (dim_1) at each time point."
    )
    assert data["num_signals"] == 1

    # Load the file and apply the same STFT conversion as the profile_2d view
    # (time extracted the same way as in the tabular loader)
    df = pd.read_parquet(file_name, columns=["mirnov"]).fillna(0)
    time = pd.to_timedelta(df.index, unit="s").total_seconds().to_list()
    dim_1, stft_time, values = compute_stft(
        TimeSeriesData(time=time, values=df.mirnov.to_list())
    )
    time = stft_time

    sig = data["signal"]
    assert sig["time"]["count"] == len(time)
    assert sig["time"]["min"] == time.min()
    assert sig["time"]["max"] == time.max()
    assert sig["dim_1"]["count"] == len(dim_1)
    assert sig["dim_1"]["min"] == dim_1.min()
    assert sig["dim_1"]["max"] == dim_1.max()
    assert sig["values"]["shape"] == list(values.shape)
    assert sig["values"]["count"] == values.size
    assert sig["values"]["min"] == values.min()
    assert sig["values"]["max"] == values.max()
    # mean via approx: the endpoint reduces a nested Python list, which can
    # differ from the ndarray reduction by a ULP
    numpy.testing.assert_almost_equal(sig["values"]["mean"], numpy.mean(values))
