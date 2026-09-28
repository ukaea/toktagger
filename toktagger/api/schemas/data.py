import base64
import io
from typing import Literal, NoReturn, Union

import numpy as np
import pandas as pd
import xarray as xr
from PIL import Image
from pydantic import BaseModel

from toktagger.api.schemas import ConfiguredModel


class Data(BaseModel):
    def to_processed(self) -> NoReturn:
        """Bare Data carries no payload to convert."""
        raise ValueError("The bare Data type carries no payload to convert.")


class TimeSeriesData(Data):
    time: list[float]
    values: list[float]

    def to_processed(self) -> pd.DataFrame:
        """Time-indexed frame with one column named `values`."""
        frame = pd.DataFrame({"values": pd.Series(self.values, index=self.time)})
        frame.index.name = "time"
        return frame


class MultiVariateTimeSeriesData(Data):
    values: dict[str, TimeSeriesData | None]

    def to_processed(self) -> pd.DataFrame:
        """Time-indexed frame with one column per signal; None signals are skipped."""
        frame = pd.DataFrame(
            {
                name: pd.Series(series.values, index=series.time)
                for name, series in self.values.items()
                if series is not None
            }
        )
        frame.index.name = "time"
        return frame


class Profile2DData(Data):
    time: list[float]
    dim_1: list[float]
    values: list[list[float]]

    def _to_dataarray(self) -> xr.DataArray:
        # Loaders emit values as (time, dim_1) but Profile2DView emits the
        # transposed (dim_1, time) layout, so the axis order is inferred from
        # the coordinate lengths; square profiles assume the loader layout.
        values = np.asarray(self.values, dtype=float)
        time = np.asarray(self.time, dtype=float)
        dim_1 = np.asarray(self.dim_1, dtype=float)
        if values.ndim != 2:
            raise ValueError(f"Profile values must be 2D, got shape {values.shape}.")
        if values.shape[0] != len(time):
            if values.shape[0] != len(dim_1):
                raise ValueError(
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

    def to_processed(self) -> xr.Dataset:
        """Dataset with one variable named `values`, dims (time, dim_1)."""
        return xr.Dataset({"values": self._to_dataarray()})


class MultiProfile2DData(Data):
    values: dict[str, Profile2DData | None]

    def to_processed(self) -> xr.Dataset:
        """One variable per profile; None profiles are skipped, coordinates align on their union."""
        members = {
            name: profile._to_dataarray()
            for name, profile in self.values.items()
            if profile is not None
        }
        try:
            return xr.Dataset(members)
        except ValueError as e:
            raise ValueError(
                f"Could not combine the profiles into one Dataset ({e}); "
                "convert them individually with to_processed()."
            ) from e


class ImageData(Data):
    frame: int
    values: str | list[int]  # Base64-encoded string or raw encoded file bytes

    def to_processed(self) -> np.ndarray:
        """Decoded pixel array: (H, W) grayscale, (H, W, 3) RGB, (H, W, 4) RGBA."""
        try:
            raw = (
                base64.b64decode(self.values)
                if isinstance(self.values, str)
                else bytes(self.values)
            )
            image = Image.open(io.BytesIO(raw))
            image.load()  # force decoding so corrupt payloads raise here
        except (OSError, ValueError) as e:
            raise ValueError(f"Could not decode image data: {e}") from e
        if image.mode in ("P", "PA"):
            image = image.convert("RGBA")
        return np.asarray(image)


class DataParams(ConfiguredModel):
    name: Literal["identity"] = "identity"


class ImageParams(DataParams):
    name: Literal["image"] = "image"
    frame: int | None
    # Optional: Return raw encoded image bytes instead of base64.
    return_raw: bool = False


DataResponseType = Union[
    Data,
    ImageData,
    MultiVariateTimeSeriesData,
    Profile2DData,
    MultiProfile2DData,
]

DataParamTypes = Union[DataParams, ImageParams]
