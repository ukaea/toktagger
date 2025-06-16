from pydantic import BaseModel


class Data(BaseModel):
    pass


class TimeSeriesData(Data):
    time: list[float]
    values: list[float]


class MultiVariateTimeSeriesData(Data):
    values: dict[str, TimeSeriesData]


class SpectrogramData(Data):
    time: list[float]
    frequency: list[float]
    value: list[float]


class ImageData(Data):
    data: list[list[tuple[int, int, int]]]
