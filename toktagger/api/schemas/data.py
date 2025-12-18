from typing import Union
from pydantic import BaseModel
from enum import Enum
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


class LoaderType(str, Enum):
    IDENTITY = "identity"
    IMAGE = "image"


class DataParams(ConfiguredModel):
    name: LoaderType = LoaderType.IDENTITY


class ImageParams(DataParams):
    name: LoaderType = LoaderType.IMAGE
    frame: int | None


DataResponseType = Union[
    Data,
    ImageData,
    MultiVariateTimeSeriesData,
    CompositeData,
    SpectrogramData,
]

DataParamTypes = Union[DataParams, ImageParams]
