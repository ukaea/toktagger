from typing import Union, Literal
from pydantic import BaseModel
from toktagger.api.schemas import ConfiguredModel


class Data(BaseModel):
    pass


class TimeSeriesData(Data):
    time: list[float]
    values: list[float]


class MultiVariateTimeSeriesData(Data):
    values: dict[str, TimeSeriesData | None]


class CompositeData(Data):
    values: dict[str, "DataResponseType"]


class SpectrogramData(Data):
    time: list[float]
    frequency: list[float]
    amplitude: list[list[float]]


class ImageData(Data):
    frame: int
    values: str  # Base64 encoded string


class DataParams(ConfiguredModel):
    name: Literal["identity"] = "identity"


class ImageParams(DataParams):
    name: Literal["image"] = "image"
    frame: int | None


DataResponseType = Union[
    Data,
    ImageData,
    MultiVariateTimeSeriesData,
    CompositeData,
    SpectrogramData,
]

DataParamTypes = Union[DataParams, ImageParams]
