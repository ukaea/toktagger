from typing import Union, Optional
from pydantic import BaseModel


class Data(BaseModel):
    pass


class TimeSeriesData(Data):
    time: list[float]
    values: list[float]


class MultiVariateTimeSeriesData(Data):
    values: dict[str, TimeSeriesData]


class CompositeData(Data):
    values: dict[str, "DataResponseType"]


class SpectrogramData(Data):
    time: list[float]
    frequency: list[float]
    amplitude: list[list[float]]
    threshold_mask: list[list[float]]


class ImageData(Data):
    data: list[list[tuple[int, int, int]]]


DataResponseType = Union[
    Data,
    ImageData,
    MultiVariateTimeSeriesData,
    ImageData,
    CompositeData,
    SpectrogramData,
]
