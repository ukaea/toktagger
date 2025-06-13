from typing import List
from pydantic import BaseModel
from enum import Enum


class DataTypes(Enum):
    TIME_SERIES = "time_series"
    IMAGE = "image"


class Annotator(BaseModel):
    pass


class FindPeaksParams(Annotator):
    prominence: float
    distance: int


class TimeSeriesChangepoints(Annotator):
    penalty: int
