"""Analysis helpers for data fetched with the TokTagger client.

Pure conversion utilities (no HTTP): they take the Pydantic models returned by
`TokTaggerClient` and turn them into pandas / xarray / numpy objects for
downstream analysis.
"""

from __future__ import annotations

import base64
import io
from typing import overload

import numpy as np
import pandas as pd
import xarray as xr
from PIL import Image

from toktagger.api.schemas.annotations import AnnotationOutTypes
from toktagger.api.schemas.data import (
    ImageData,
    MultiProfile2DData,
    MultiVariateTimeSeriesData,
    Profile2DData,
    TimeSeriesData,
)

from toktagger.client.exceptions import TokTaggerClientError


def annotations_to_dataframe(annotations: list[AnnotationOutTypes]) -> pd.DataFrame:
    """Convert fetched annotations into a single pandas DataFrame.

    Produces one row per annotation, with a column for every field present on
    any of the annotations. Fields that only exist on some annotation types
    (e.g. `time_min`/`time_max` on time regions but not time points) are
    NaN for the rows that lack them, so mixed annotation types can be
    aggregated together.

    Parameters
    ----------
    annotations : list of annotation models
        Annotations returned by e.g. `TokTaggerClient.list_annotations()`.

    Returns
    -------
    pandas.DataFrame
        One row per annotation. Columns include `id`, `label`, `type`,
        `created_by`, `validated`, `signal_name`, `uncertainty`,
        `project_id`, `sample_id`, `shot_id` and `timestamp`, plus
        type-specific fields such as `time`, `time_min`/`time_max`,
        `x_min`/`y_min` or `frame`/`track_id`. Empty input yields an
        empty DataFrame.

    Examples
    --------
    Aggregate a project's annotations (across all its samples) into one frame:

        from toktagger.client import annotations_to_dataframe

        df = annotations_to_dataframe(client.list_annotations(project_id))
    """
    # model_dump without by_alias so the frame carries `id`, not the DB's `_id`
    rows = [annotation.model_dump(mode="json") for annotation in annotations]
    return pd.DataFrame(rows)


def timeseries_to_dataframe(
    data: TimeSeriesData | MultiVariateTimeSeriesData,
) -> pd.DataFrame:
    """Convert a sample's time-series data into a pandas DataFrame.

    Parameters
    ----------
    data : TimeSeriesData or MultiVariateTimeSeriesData
        Time-series data returned by e.g. `TokTaggerClient.get_data()` (or a
        single time series from `MultiVariateTimeSeriesData.values`).

    Returns
    -------
    pandas.DataFrame
        A frame indexed by time (index named `time`) with one column per
        signal. A `MultiVariateTimeSeriesData` gives one column per signal
        name; signals whose value is None are skipped, and differing time
        arrays are aligned on their union (missing points become NaN). A bare
        `TimeSeriesData` has no signal name, so its column is `values`.

    Raises
    ------
    TokTaggerClientError
        If the data is not time-series.

    Examples
    --------
    Fetch a sample's time series as a frame:

        from toktagger.client import timeseries_to_dataframe

        df = timeseries_to_dataframe(client.get_data(project_id, sample_id))
    """
    if isinstance(data, MultiVariateTimeSeriesData):
        frame = pd.DataFrame(
            {
                name: pd.Series(values.values, index=values.time)
                for name, values in data.values.items()
                if values is not None
            }
        )
        frame.index.name = "time"
        return frame
    if isinstance(data, TimeSeriesData):
        # Uniform with the multivariate frame: time-indexed, one column
        frame = pd.DataFrame({"values": pd.Series(data.values, index=data.time)})
        frame.index.name = "time"
        return frame
    raise TokTaggerClientError(
        f"{type(data).__name__} is not time-series data; use "
        "profile2d_to_xarray for profiles, image_to_array for images, or "
        "extract_data to dispatch by type."
    )


def _profile2d_to_dataarray(profile: Profile2DData) -> xr.DataArray:
    """Build a DataArray from a profile, normalised to dims (time, dim_1).

    Loaders emit `values` as (time, dim_1) but Profile2DView emits the
    transposed (dim_1, time) layout, so the axis order is inferred from the
    coordinate lengths. Square profiles are ambiguous and assume the loader
    layout.
    """
    values = np.asarray(profile.values, dtype=float)
    time = np.asarray(profile.time, dtype=float)
    dim_1 = np.asarray(profile.dim_1, dtype=float)
    if values.ndim != 2:
        raise TokTaggerClientError(
            f"Profile values must be 2D, got shape {values.shape}."
        )
    if values.shape[0] != len(time):
        if values.shape[0] != len(dim_1):
            raise TokTaggerClientError(
                f"Profile values shape {values.shape} matches neither "
                f"len(time)={len(time)} nor len(dim_1)={len(dim_1)}; the "
                "profile data is inconsistent."
            )
        values = values.T
    return xr.DataArray(
        values,
        coords={"time": time, "dim_1": dim_1},
        dims=("time", "dim_1"),
    )


def profile2d_to_xarray(profile: Profile2DData | MultiProfile2DData) -> xr.Dataset:
    """Convert a sample's 2D-profile data into an xarray Dataset.

    Parameters
    ----------
    profile : Profile2DData or MultiProfile2DData
        Profile data returned by e.g. `TokTaggerClient.get_data()`
        for a project with the `profile-2d` task.

    Returns
    -------
    xarray.Dataset
        One variable per profile, each with dims `(time, dim_1)` and both
        coordinate axes attached. A single `Profile2DData` yields a Dataset
        with one variable named `values`. For `MultiProfile2DData`,
        profiles whose value is None are skipped, and profiles with differing
        coordinates are aligned on their union (missing points become NaN),
        as in the time-series helper.

    Raises
    ------
    TokTaggerClientError
        If the data is not profile data, or the profile's values are
        inconsistent with its coordinate lengths.

    Notes
    -----
    `Profile2DData.values` is documented nowhere with a fixed axis order:
    loaders emit `(time, dim_1)` while `Profile2DView` emits the
    transposed `(dim_1, time)` layout, so the axis order is inferred from
    the coordinate lengths. Square profiles are ambiguous and are assumed to
    be `(time, dim_1)`.

    Examples
    --------
    Fetch a spectrogram (or similar 2D profile) as a Dataset:

        from toktagger.client import profile2d_to_xarray
        from toktagger.api.schemas.views import Profile2DViewParams

        ds = profile2d_to_xarray(
            client.get_data(
                project_id, sample_id, view=Profile2DViewParams(signal_name="Ip")
            )
        )
        profile = ds["values"]
    """
    if isinstance(profile, MultiProfile2DData):
        members = {
            name: _profile2d_to_dataarray(item)
            for name, item in profile.values.items()
            if item is not None
        }
        try:
            return xr.Dataset(members)
        except ValueError as e:
            raise TokTaggerClientError(
                f"Could not combine the profiles into one Dataset ({e}); "
                "convert them individually with "
                "profile2d_to_xarray(profile)."
            ) from e
    if isinstance(profile, Profile2DData):
        # Uniform Dataset return: a single profile lands under "values"
        return xr.Dataset({"values": _profile2d_to_dataarray(profile)})
    raise TokTaggerClientError(
        f"{type(profile).__name__} is not profile data; use "
        "timeseries_to_dataframe for time series, image_to_array for images, "
        "or extract_data to dispatch by type."
    )


def image_to_array(data: ImageData) -> np.ndarray:
    """Decode an image response into a numpy array.

    Parameters
    ----------
    data : ImageData
        Image data returned by e.g. `TokTaggerClient.get_data()`.

    Returns
    -------
    numpy.ndarray
        The decoded pixel array in the image's native mode: `(H, W)` for
        grayscale, `(H, W, 3)` for RGB, `(H, W, 4)` for RGBA.

    Raises
    ------
    TokTaggerClientError
        If the data is not an image, or the encoded bytes cannot be decoded.

    Examples
    --------
    Fetch a video frame as a numpy array:

        from toktagger.client import image_to_array
        from toktagger.api.schemas.data import ImageParams

        frame = image_to_array(
            client.get_data(project_id, sample_id, params=ImageParams(frame=0))
        )
    """
    if not isinstance(data, ImageData):
        raise TokTaggerClientError(
            f"{type(data).__name__} is not image data; use "
            "timeseries_to_dataframe for time series, profile2d_to_xarray for "
            "profiles, or extract_data to dispatch by type."
        )
    try:
        raw = (
            base64.b64decode(data.values)
            if isinstance(data.values, str)
            else bytes(data.values)
        )
        image = Image.open(io.BytesIO(raw))
        image.load()  # force decoding so corrupt payloads raise here
    except (OSError, ValueError) as e:
        raise TokTaggerClientError(f"Could not decode image data: {e}") from e
    if image.mode in ("P", "PA"):
        image = image.convert("RGBA")
    return np.asarray(image)


@overload
def extract_data(data: TimeSeriesData) -> pd.DataFrame: ...
@overload
def extract_data(data: MultiVariateTimeSeriesData) -> pd.DataFrame: ...
@overload
def extract_data(data: Profile2DData) -> xr.Dataset: ...
@overload
def extract_data(data: MultiProfile2DData) -> xr.Dataset: ...
@overload
def extract_data(data: ImageData) -> np.ndarray: ...
def extract_data(
    data: TimeSeriesData
    | MultiVariateTimeSeriesData
    | Profile2DData
    | MultiProfile2DData
    | ImageData,
) -> pd.DataFrame | xr.Dataset | np.ndarray:
    """Extract whatever `get_data()` returned into its natural container.

    Dispatches on the data type so you can convert a response
    without checking the type yourself.

    TimeSeriesData or MultiVariateTimeSeriesData returns a pandas.DataFrame
    Profile2DData or MultiProfile2DData returns an xarray.Dataset
    ImageData returns a numpy.ndarray

    Parameters
    ----------
    data : TimeSeriesData | MultiVariateTimeSeriesData | Profile2DData | MultiProfile2DData | ImageData
        Sample data returned by e.g. `TokTaggerClient.get_data()`,
        or data from one of the signals within multivariate data.

    Returns
    -------
    pandas.DataFrame | xarray.Dataset | numpy.ndarray
        The extracted dara type - see the individual helper functions for the exact layout.

    Raises
    ------
    TokTaggerClientError
        If the data has no payload or cannot be decoded.

    Examples
    --------
    Convert any sample data as it comes back:

        from toktagger.client import extract_data

        result = extract_data(client.get_data(project_id, sample_id))
    """
    if isinstance(data, (TimeSeriesData, MultiVariateTimeSeriesData)):
        return timeseries_to_dataframe(data)
    if isinstance(data, (Profile2DData, MultiProfile2DData)):
        return profile2d_to_xarray(data)
    if isinstance(data, ImageData):
        return image_to_array(data)
    raise TokTaggerClientError(
        f"{type(data).__name__} is not extractable; the bare Data base "
        "type carries no payload."
    )
