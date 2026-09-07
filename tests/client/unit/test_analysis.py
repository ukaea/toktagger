import base64
import io

import numpy as np
import pandas as pd
import pytest
import tests.db_definitions as db_definitions
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
from toktagger.client import analysis
from toktagger.client.exceptions import TokTaggerClientError

TIME_POINT_ID = "7" * 24


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


def test_annotations_to_dataframe_mixed_types():
    df = analysis.annotations_to_dataframe(
        [db_definitions.ANNOTATION_1, db_definitions.ANNOTATION_3]
    )

    assert len(df) == 2
    # Common fields become columns, with the DB id under the name `id`
    expected_columns = {
        "id",
        "label",
        "type",
        "created_by",
        "validated",
        "project_id",
        "sample_id",
        "shot_id",
        "signal_name",
        "uncertainty",
        "timestamp",
        "time",
        "time_min",
        "time_max",
    }
    assert expected_columns == set(df.columns)
    assert df["type"].tolist() == ["time_region", "time_point"]
    # Type-specific fields are NaN for rows that lack them
    assert df.loc[0, "time_min"] == db_definitions.ANNOTATION_1.time_min
    assert pd.isna(df.loc[1, "time_min"])
    assert df.loc[1, "time"] == 0.1
    assert pd.isna(df.loc[0, "time"])


def test_annotations_to_dataframe_empty():
    df = analysis.annotations_to_dataframe([])
    assert df.empty
    assert len(df) == 0


def test_timeseries_to_dataframe_multivariate():
    data = MultiVariateTimeSeriesData(
        values={
            "Ip": TimeSeriesData(time=[0.0, 1.0, 2.0], values=[0.5, 0.6, 0.7]),
            "dalpha": TimeSeriesData(time=[0.0, 1.0, 2.0], values=[5, 6, 7]),
            # None signals (e.g. missing from the source) are skipped
            "Io": None,
        }
    )

    df = analysis.timeseries_to_dataframe(data)

    assert list(df.columns) == ["Ip", "dalpha"]
    assert df.index.name == "time"
    assert df.index.tolist() == [0.0, 1.0, 2.0]
    assert df["Ip"].tolist() == [0.5, 0.6, 0.7]
    assert df["dalpha"].tolist() == [5, 6, 7]


def test_timeseries_to_dataframe_timeseries():
    data = TimeSeriesData(time=[0.0, 1.0], values=[0.5, 0.6])

    df = analysis.timeseries_to_dataframe(data)

    # Same shape as the multivariate frame: time-indexed, one column named
    # values (the single series has no signal name of its own)
    assert df.index.name == "time"
    assert list(df.columns) == ["values"]
    assert df.index.tolist() == [0.0, 1.0]
    assert df["values"].tolist() == [0.5, 0.6]


@pytest.mark.parametrize(
    "data",
    [
        Data(),
        ImageData(frame=0, values="BASE64"),
        Profile2DData(time=[0.0], dim_1=[1.0, 2.0], values=[[1.0, 2.0]]),
        MultiProfile2DData(values={}),
    ],
    ids=["Data", "ImageData", "Profile2DData", "MultiProfile2DData"],
)
def test_timeseries_to_dataframe_unsupported_raises(data):
    with pytest.raises(TokTaggerClientError, match="not time-series"):
        analysis.timeseries_to_dataframe(data)


def test_profile2d_to_xarray_time_first():
    # The loader layout: values[i][j] = (time[i], dim_1[j])
    profile = Profile2DData(
        time=[0.0, 1.0, 2.0],
        dim_1=[10.0, 20.0],
        values=[[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]],
    )

    ds = analysis.profile2d_to_xarray(profile)

    # A single profile becomes a Dataset with one variable named "values"
    assert isinstance(ds, xr.Dataset)
    assert set(ds.data_vars) == {"values"}
    da = ds["values"]
    assert da.dims == ("time", "dim_1")
    assert da.shape == (3, 2)
    assert da["time"].values.tolist() == [0.0, 1.0, 2.0]
    assert da["dim_1"].values.tolist() == [10.0, 20.0]
    assert da.values.tolist() == [[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]]


def test_profile2d_to_xarray_transposed_input():
    # The Profile2DView layout: (dim_1, time), inferred and normalised
    profile = Profile2DData(
        time=[0.0, 1.0, 2.0],
        dim_1=[10.0, 20.0],
        values=[[1.0, 3.0, 5.0], [2.0, 4.0, 6.0]],
    )

    ds = analysis.profile2d_to_xarray(profile)

    da = ds["values"]
    assert da.dims == ("time", "dim_1")
    assert da.values.tolist() == [[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]]


def test_profile2d_to_xarray_inconsistent_shape_raises():
    profile = Profile2DData(
        time=[0.0, 1.0, 2.0],
        dim_1=[10.0, 20.0],
        # 4 rows matches neither len(time) nor len(dim_1)
        values=[[1.0, 2.0], [3.0, 4.0], [5.0, 6.0], [7.0, 8.0]],
    )

    with pytest.raises(TokTaggerClientError, match="matches neither"):
        analysis.profile2d_to_xarray(profile)


def test_profile2d_to_xarray_multi():
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

    ds = analysis.profile2d_to_xarray(data)

    assert isinstance(ds, xr.Dataset)
    assert set(ds.data_vars) == {"Ip", "dalpha"}
    assert ds["Ip"].dims == ("time", "dim_1")
    assert ds["Ip"].values.tolist() == [[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]]
    assert ds["dalpha"].values.tolist() == [[7.0, 8.0], [9.0, 10.0], [11.0, 12.0]]


def test_profile2d_to_xarray_multi_alignment():
    def make(time, values):
        return Profile2DData(time=time, dim_1=[10.0, 20.0], values=values)

    data = MultiProfile2DData(
        values={
            "a": make([0.0, 1.0, 2.0], [[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]]),
            # Shorter time axis: aligned on the union, gap becomes NaN
            "b": make([0.0, 1.0], [[2.0, 4.0], [6.0, 8.0]]),
        }
    )

    ds = analysis.profile2d_to_xarray(data)

    assert set(ds.data_vars) == {"a", "b"}
    assert ds["a"].values.tolist() == [[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]]
    # Aligned to the union of times, with NaN where the profile has no data
    b_values = ds["b"].values
    assert b_values[:2].tolist() == [[2.0, 4.0], [6.0, 8.0]]
    assert np.isnan(b_values[2]).all()


def test_profile2d_to_xarray_unsupported_raises():
    data = MultiVariateTimeSeriesData(
        values={"Ip": TimeSeriesData(time=[0.0], values=[0.5])}
    )
    with pytest.raises(TokTaggerClientError, match="not profile"):
        analysis.profile2d_to_xarray(data)


def test_image_to_array_base64():
    data = ImageData(frame=0, values=b64("RGB"))

    array = analysis.image_to_array(data)

    assert isinstance(array, np.ndarray)
    assert array.shape == (3, 4, 3)
    assert array.dtype == np.uint8
    assert array[0, 0].tolist() == [255, 0, 0]


def test_image_to_array_raw_bytes():
    data = ImageData(frame=0, values=list(make_png("RGB")))

    array = analysis.image_to_array(data)

    assert array.shape == (3, 4, 3)
    assert array[0, 0].tolist() == [255, 0, 0]


def test_image_to_array_grayscale():
    data = ImageData(frame=0, values=b64("L"))

    array = analysis.image_to_array(data)

    assert array.shape == (3, 4)
    assert (array == 128).all()


def test_image_to_array_palette_expanded_to_rgba():
    data = ImageData(frame=0, values=b64("P"))

    array = analysis.image_to_array(data)

    # Palette indices are not colours, so they are expanded to RGBA
    assert array.shape == (3, 4, 4)


@pytest.mark.parametrize(
    "values",
    ["!!!not base64!!!", base64.b64encode(b"not an image").decode()],
    ids=["invalid-base64", "undecodable-image"],
)
def test_image_to_array_invalid_raises(values):
    with pytest.raises(TokTaggerClientError, match="decode"):
        analysis.image_to_array(ImageData(frame=0, values=values))


def test_image_to_array_unsupported_raises():
    data = TimeSeriesData(time=[0.0], values=[0.5])
    with pytest.raises(TokTaggerClientError, match="not image"):
        analysis.image_to_array(data)


@pytest.mark.parametrize(
    "data, expected_type",
    [
        (TimeSeriesData(time=[0.0], values=[0.5]), pd.DataFrame),
        (
            MultiVariateTimeSeriesData(
                values={"Ip": TimeSeriesData(time=[0.0], values=[0.5])}
            ),
            pd.DataFrame,
        ),
        (
            Profile2DData(time=[0.0, 1.0], dim_1=[1.0], values=[[0.5], [0.6]]),
            xr.Dataset,
        ),
        (
            MultiProfile2DData(
                values={
                    "a": Profile2DData(
                        time=[0.0, 1.0], dim_1=[1.0], values=[[0.5], [0.6]]
                    ),
                    "b": None,
                }
            ),
            xr.Dataset,
        ),
        (ImageData(frame=0, values=b64("RGB")), np.ndarray),
    ],
    ids=["timeseries", "multivariate", "profile", "multi-profile", "image"],
)
def test_extract_data_dispatches(data, expected_type):
    result = analysis.extract_data(data)
    assert type(result) is expected_type


def test_extract_data_bare_data_raises():
    with pytest.raises(TokTaggerClientError, match="no payload"):
        analysis.extract_data(Data())
