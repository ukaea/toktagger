from typing import List, Optional
from pydantic import BaseModel
from enum import Enum


class DataTypes(Enum):
    TIME_SERIES = "time_series"
    IMAGE = "image"


class Annotator(BaseModel):
    pass


class FindPeaksParams(Annotator):
    signal_name: str
    prominence: float
    distance: int
    time_min: Optional[float]
    time_max: Optional[float]


class TimeSeriesChangepoints(Annotator):
    penalty: int

