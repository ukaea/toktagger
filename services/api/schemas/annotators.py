from typing import List, Optional, Union
from pydantic import BaseModel
from enum import Enum


class AnnotatorIds(str, Enum):
    FIND_PEAKS = "find_peaks"
    THRESHOLD = "threshold"


class DataTypes(Enum):
    TIME_SERIES = "time_series"
    IMAGE = "image"


class Annotator(BaseModel):
    pass


class FindPeaksParams(Annotator):
    signal_name: str
    prominence: float
    distance: int
    time_min: Optional[float] = None
    time_max: Optional[float] = None


class TimeSeriesChangepoints(Annotator):
    penalty: int


class SpectrogramThresholdParams(Annotator):
    signal_name: str
    percentile: float


AnnotatorTypes = Union[
    FindPeaksParams,
    TimeSeriesChangepoints,
    SpectrogramThresholdParams,
]
