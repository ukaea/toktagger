import base64
import io

import numpy as np
import pandas as pd
import pytest
import xarray as xr
from PIL import Image
from toktagger.api.schemas.data import (
    Data,
    ImageData,
    MultiProfile2DData,
    MultiVariateTimeSeriesData,
    Profile2DData,
    TimeSeriesData,
)


def make_png(mode: str, size=(4, 3)) -> bytes:
    if mode == "P":
        # Default palette is fine; only the mode matters here
        image = Image.new(mode, size)
    elif mode == "L":
        image = Image.new(mode, size, 128)
    else:
        image = Image.new(mode, size, (255, 0, 0))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def b64(mode: str) -> str:
    return base64.b64encode(make_png(mode)).decode()


def test_timeseries_to_processed():
    data = TimeSeriesData(time=[0.0, 1.0], values=[0.5, 0.6])

    df = data.to_processed()

    # Time-indexed, one column named values (the single series has no signal
    # name of its own)
    assert isinstance(df, pd.DataFrame)
    assert df.index.name == "time"
    assert list(df.columns) == ["values"]
    assert df.index.tolist() == [0.0, 1.0]
    assert df["values"].tolist() == [0.5, 0.6]


def test_multivariate_timeseries_to_processed():
    data = MultiVariateTimeSeriesData(
        values={
            "Ip": TimeSeriesData(time=[0.0, 1.0, 2.0], values=[0.5, 0.6, 0.7]),
            "dalpha": TimeSeriesData(time=[0.0, 1.0, 2.0], values=[5, 6, 7]),
            # None signals (e.g. missing from the source) are skipped
            "Io": None,
        }
    )

    df = data.to_processed()

    assert isinstance(df, pd.DataFrame)
    assert list(df.columns) == ["Ip", "dalpha"]
    assert df.index.name == "time"
    assert df.index.tolist() == [0.0, 1.0, 2.0]
    assert df["Ip"].tolist() == [0.5, 0.6, 0.7]
    assert df["dalpha"].tolist() == [5, 6, 7]


def test_bare_data_to_processed_raises():
    with pytest.raises(ValueError, match="no payload"):
        Data().to_processed()


def test_profile2d_to_processed_time_first():
    # The loader layout: values[i][j] = (time[i], dim_1[j])
    profile = Profile2DData(
        time=[0.0, 1.0, 2.0],
        dim_1=[10.0, 20.0],
        values=[[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]],
    )

    ds = profile.to_processed()

    # A single profile becomes a Dataset with one variable named "values"
    assert isinstance(ds, xr.Dataset)
    assert set(ds.data_vars) == {"values"}
    da = ds["values"]
    assert da.dims == ("time", "dim_1")
    assert da.shape == (3, 2)
    assert da["time"].values.tolist() == [0.0, 1.0, 2.0]
    assert da["dim_1"].values.tolist() == [10.0, 20.0]
    assert da.values.tolist() == [[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]]


def test_profile2d_to_processed_transposed_input():
    # The Profile2DView layout: (dim_1, time), inferred and normalised
    profile = Profile2DData(
        time=[0.0, 1.0, 2.0],
        dim_1=[10.0, 20.0],
        values=[[1.0, 3.0, 5.0], [2.0, 4.0, 6.0]],
    )

    ds = profile.to_processed()

    da = ds["values"]
    assert da.dims == ("time", "dim_1")
    assert da.values.tolist() == [[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]]


def test_profile2d_to_processed_inconsistent_shape_raises():
    profile = Profile2DData(
        time=[0.0, 1.0, 2.0],
        dim_1=[10.0, 20.0],
        # 4 rows matches neither len(time) nor len(dim_1)
        values=[[1.0, 2.0], [3.0, 4.0], [5.0, 6.0], [7.0, 8.0]],
    )

    with pytest.raises(ValueError, match="matches neither"):
        profile.to_processed()


def test_multi_profile2d_to_processed():
    def make(values):
        return Profile2DData(time=[0.0, 1.0, 2.0], dim_1=[10.0, 20.0], values=values)

    data = MultiProfile2DData(
        values={
            "Ip": make([[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]]),
            "dalpha": make([[7.0, 8.0], [9.0, 10.0], [11.0, 12.0]]),
            # None profiles (e.g. missing from the source) are skipped
            "We": None,
        }
    )

    ds = data.to_processed()

    assert isinstance(ds, xr.Dataset)
    assert set(ds.data_vars) == {"Ip", "dalpha"}
    assert ds["Ip"].dims == ("time", "dim_1")
    assert ds["Ip"].values.tolist() == [[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]]
    assert ds["dalpha"].values.tolist() == [[7.0, 8.0], [9.0, 10.0], [11.0, 12.0]]


def test_multi_profile2d_to_processed_alignment():
    def make(time, values):
        return Profile2DData(time=time, dim_1=[10.0, 20.0], values=values)

    data = MultiProfile2DData(
        values={
            "a": make([0.0, 1.0, 2.0], [[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]]),
            # Shorter time axis: aligned on the union, gap becomes NaN
            "b": make([0.0, 1.0], [[2.0, 4.0], [6.0, 8.0]]),
        }
    )

    ds = data.to_processed()

    assert set(ds.data_vars) == {"a", "b"}
    assert ds["a"].values.tolist() == [[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]]
    # Aligned to the union of times, with NaN where the profile has no data
    b_values = ds["b"].values
    assert b_values[:2].tolist() == [[2.0, 4.0], [6.0, 8.0]]
    assert np.isnan(b_values[2]).all()


def test_image_to_processed_base64():
    data = ImageData(frame=0, values=b64("RGB"))

    array = data.to_processed()

    assert isinstance(array, np.ndarray)
    assert array.shape == (3, 4, 3)
    assert array.dtype == np.uint8
    assert array[0, 0].tolist() == [255, 0, 0]


def test_image_to_processed_raw_bytes():
    data = ImageData(frame=0, values=list(make_png("RGB")))

    array = data.to_processed()

    assert array.shape == (3, 4, 3)
    assert array[0, 0].tolist() == [255, 0, 0]


def test_image_to_processed_grayscale():
    data = ImageData(frame=0, values=b64("L"))

    array = data.to_processed()

    assert array.shape == (3, 4)
    assert (array == 128).all()


def test_image_to_processed_palette_expanded_to_rgba():
    data = ImageData(frame=0, values=b64("P"))

    array = data.to_processed()

    # Palette indices are not colours, so they are expanded to RGBA
    assert array.shape == (3, 4, 4)


@pytest.mark.parametrize(
    "values",
    ["!!!not base64!!!", base64.b64encode(b"not an image").decode()],
    ids=["invalid-base64", "undecodable-image"],
)
def test_image_to_processed_invalid_raises(values):
    with pytest.raises(ValueError, match="decode"):
        ImageData(frame=0, values=values).to_processed()
