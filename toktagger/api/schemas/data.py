from typing import Union
from pydantic import BaseModel
from enum import Enum


class Data(BaseModel):
    pass


class TimeSeriesData(Data):
    time: list[float]
    values: list[float]


class MultiVariateTimeSeriesData(Data):
    values: dict[str, TimeSeriesData | None]


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


class DataParams(BaseModel):
    name: LoaderType = LoaderType.IDENTITY


class ImageParams(DataParams):
    frame: int


DataResponseType = Union[
    Data,
    ImageData,
    MultiVariateTimeSeriesData,
    SpectrogramData,
]

DataParamTypes = Union[DataParams, ImageParams]
