import base64
import io
from typing import Union, Literal

import numpy
from PIL import Image
from pydantic import BaseModel

from toktagger.api.schemas import ConfiguredModel


class Data(BaseModel):
    pass


class SampleSummary(BaseModel):
    type: str
    description: str
    num_signals: int


class SummaryAxes(BaseModel):
    count: int
    max: float
    min: float


class SummaryValues(SummaryAxes):
    mean: float


class Summary2DValues(SummaryValues):
    shape: tuple[int, int]


class SignalSummary(BaseModel):
    time: SummaryAxes
    values: SummaryValues


class Signal2DSummary(BaseModel):
    time: SummaryAxes
    dim_1: SummaryAxes
    values: Summary2DValues


class ImageSampleSummary(SampleSummary, SummaryValues):
    type: Literal["video"]
    frame_number: int
    shape: tuple[int, ...]
    height: int
    width: int
    colour_mode: str


class TimeSeriesSampleSummary(SampleSummary):
    type: Literal["time-series"]
    signal: SignalSummary


class MultiVariateTimeSeriesSampleSummary(SampleSummary):
    type: Literal["time-series"]
    signals: dict[str, SignalSummary]


class Profile2DSampleSummary(SampleSummary):
    type: Literal["profile-2d"]
    signal: Signal2DSummary


class MultiVariateProfile2DSampleSummary(SampleSummary):
    type: Literal["profile-2d"]
    signals: dict[str, Signal2DSummary]


class TimeSeriesData(Data):
    time: list[float]
    values: list[float]

    def summary(self) -> TimeSeriesSampleSummary:
        return TimeSeriesSampleSummary(
            type="time-series",
            description="Time series signal from one diagnostic inside a Tokamak.",
            num_signals=1,
            signal=SignalSummary(
                time=SummaryAxes(
                    count=len(self.time),
                    max=numpy.max(self.time),
                    min=numpy.min(self.time),
                ),
                values=SummaryValues(
                    count=len(self.values),
                    max=numpy.max(self.values),
                    min=numpy.min(self.values),
                    mean=numpy.mean(self.values),
                ),
            ),
        )


class MultiVariateTimeSeriesData(Data):
    values: dict[str, TimeSeriesData | None]

    def summary(self) -> MultiVariateTimeSeriesSampleSummary:
        return MultiVariateTimeSeriesSampleSummary(
            type="time-series",
            description="Time series signals from one or more diagnostics inside a Tokamak.",
            num_signals=len(self.values),
            signals={
                signal: time_series.summary().signal
                for signal, time_series in self.values.items()
            },
        )


class Profile2DData(Data):
    time: list[float]
    dim_1: list[float]
    values: list[list[float]]

    def summary(self) -> Profile2DSampleSummary:
        values = numpy.array(self.values)
        return Profile2DSampleSummary(
            type="profile-2d",
            description="2D profile signal from one diagnostic inside a Tokamak (eg, spectrometer). Contains measurements of points along an axis (dim_1) at each time point.",
            num_signals=1,
            signal=Signal2DSummary(
                time=SummaryAxes(
                    count=len(self.time),
                    max=numpy.max(self.time),
                    min=numpy.min(self.time),
                ),
                dim_1=SummaryAxes(
                    count=len(self.dim_1),
                    max=numpy.max(self.dim_1),
                    min=numpy.min(self.dim_1),
                ),
                values=Summary2DValues(
                    shape=values.shape,
                    count=values.size,
                    max=values.max(),
                    min=values.min(),
                    mean=values.mean(),
                ),
            ),
        )


class MultiProfile2DData(Data):
    values: dict[str, Profile2DData | None]

    def summary(self) -> MultiVariateProfile2DSampleSummary:
        return MultiVariateProfile2DSampleSummary(
            type="profile-2d",
            description="2D profile signals from one or more diagnostics inside a Tokamak (eg, spectrometers). Contains measurements of points along an axis (dim_1) at each time point.",
            num_signals=len(self.values),
            signals={
                signal: profile.signal_summary().signal
                for signal, profile in self.values.items()
                if profile
            },
        )


class ImageData(Data):
    frame: int
    values: str | list[int]  # Base64-encoded string or raw encoded file bytes

    def summary(self) -> ImageSampleSummary:
        # values may be base64-encoded, or raw encoded file bytes when return_raw is set
        encoded = (
            base64.b64decode(self.values)
            if isinstance(self.values, str)
            else bytes(self.values)
        )
        im = Image.open(io.BytesIO(encoded))
        arr = numpy.array(im)
        return ImageSampleSummary(
            type="video",
            description="One frame from a camera diagnostic video inside a Tokamak",
            num_signals=1,
            frame_number=self.frame,
            shape=arr.shape,
            height=arr.shape[0],
            width=arr.shape[1],
            colour_mode=im.mode,
            count=arr.size,
            max=arr.max(),
            min=arr.min(),
            mean=arr.mean(),
        )


class DataParams(ConfiguredModel):
    name: Literal["identity"] = "identity"


class ImageParams(DataParams):
    name: Literal["image"] = "image"
    frame: int | None
    # Optional: Return raw encoded image bytes instead of base64.
    return_raw: bool = False


DataResponseType = Union[
    ImageData,
    MultiVariateTimeSeriesData,
    Profile2DData,
    MultiProfile2DData,
]

DataParamTypes = Union[DataParams, ImageParams]

SampleSummaryTypes = Union[
    ImageSampleSummary,
    TimeSeriesSampleSummary,
    MultiVariateTimeSeriesSampleSummary,
    Profile2DSampleSummary,
    MultiVariateProfile2DSampleSummary,
]
