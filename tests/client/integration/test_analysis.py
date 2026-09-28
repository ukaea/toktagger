import pathlib

import numpy as np
import pandas as pd
import pytest
import requests
import tests.endpoints as endpoints
import xarray as xr
from PIL import Image
from toktagger.api.schemas.data import (
    ImageData,
    ImageParams,
    MultiVariateTimeSeriesData,
    Profile2DData,
)
from toktagger.api.schemas.views import Profile2DViewParams
from tests.client.conftest import BASE_URL


@pytest.fixture(scope="module")
def seeded_profile2d_project(client):
    # Mirrors the e2e profile-2d seeding: the tabular loader reads the raw
    # signal and the profile-2d view (STFT) produces the 2D profile.
    project_id = endpoints.create_project(
        "client_profile2d_project", "profile-2d", "tabular"
    )
    sample_ids = endpoints.create_local_samples(
        project_id,
        [10000],
        pathlib.Path(__file__).parents[2],
        ["Ip"],
        file_names=["profile2d.parquet"],
    )
    yield project_id, sample_ids
    requests.delete(f"{BASE_URL}/projects/{project_id}")


@pytest.fixture(scope="module")
def seeded_image_project(client):
    # The "image" loader serves one frame per file from a folder of images
    project_id = endpoints.create_project("client_image_project", "video", "image")
    sample_ids = endpoints.create_image_samples(
        project_id,
        10000,
        pathlib.Path(__file__).parents[2] / "mast_images",
        "png",
    )
    yield project_id, sample_ids
    requests.delete(f"{BASE_URL}/projects/{project_id}")


def test_timeseries_to_processed_multi(client, seeded_project_with_samples):
    project_id, sample_ids = seeded_project_with_samples
    sample = client.get_project(project_id).get_sample(sample_ids[0])

    df = sample.get_data().to_processed()

    assert isinstance(df, pd.DataFrame)
    assert list(df.columns) == ["Ip"]
    assert df.index.name == "time"
    assert df.index.tolist() == list(range(100))
    # Values match the underlying parquet file
    expected = pd.read_parquet(pathlib.Path(__file__).parents[2] / "10000.parquet")
    assert df["Ip"].tolist() == expected.Ip.tolist()


def test_timeseries_to_processed_single(client, seeded_project_with_samples):
    project_id, sample_ids = seeded_project_with_samples
    data = client.get_data(project_id, sample_ids[0])
    assert isinstance(data, MultiVariateTimeSeriesData)

    # Take one time series
    df = data.values["Ip"].to_processed()

    assert isinstance(df, pd.DataFrame)
    # Same shape as the multivariate frame: time-indexed, one column named
    # values (the single series has no signal name of its own)
    assert df.index.name == "time"
    assert list(df.columns) == ["values"]
    assert df.index.tolist() == list(range(100))
    expected = pd.read_parquet(pathlib.Path(__file__).parents[2] / "10000.parquet")
    assert df["values"].tolist() == expected.Ip.tolist()


def test_profile2d_to_processed(client, seeded_profile2d_project):
    project_id, sample_ids = seeded_profile2d_project
    data = client.get_data(
        project_id, sample_ids[0], view=Profile2DViewParams(signal_name="Ip")
    )
    assert isinstance(data, Profile2DData)
    # The view emits (dim_1, time) with distinct lengths
    assert len(data.time) != len(data.dim_1)

    result = data.to_processed()

    assert isinstance(result, xr.Dataset)
    assert set(result.data_vars) == {"values"}
    da = result["values"]
    assert da.dims == ("time", "dim_1")
    # Normalised to (time, dim_1) with both coordinate axes attached
    assert da.shape == (len(data.time), len(data.dim_1))
    assert da["time"].values.tolist() == data.time
    assert da["dim_1"].values.tolist() == data.dim_1
    # Every value is preserved; none lost or duplicated
    assert sorted(da.values.ravel().tolist()) == sorted(
        np.asarray(data.values).ravel().tolist()
    )


@pytest.mark.parametrize("return_raw", (True, False))
def test_image_to_processed(client, seeded_image_project, return_raw):
    project_id, sample_ids = seeded_image_project
    data = client.get_data(
        project_id, sample_ids[0], params=ImageParams(frame=1, return_raw=return_raw)
    )
    assert isinstance(data, ImageData)

    array = data.to_processed()

    # 1.png is a colour PNG: (H, W, 3) uint8, matching the source file exactly
    assert isinstance(array, np.ndarray)
    assert array.dtype == np.uint8
    assert array.shape == (1079, 881, 3)
    source = pathlib.Path(__file__).parents[2] / "mast_images" / "1.png"
    assert np.array_equal(array, np.asarray(Image.open(source)))
