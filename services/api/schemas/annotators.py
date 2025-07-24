from typing import Literal, Optional, Union
from pydantic import BaseModel
from enum import Enum


class AnnotatorIds(str, Enum):
    PEAK_DETECTION = "peak_detection"
    OUTLIER_DETECTION = "outlier_detection"
    CHANGE_POINT_DETECTION = "change_point_detection"
    JUMP_DETECTION = "jump_detection"


class DataTypes(Enum):
    TIME_SERIES = "time_series"
    IMAGE = "image"


class Annotator(BaseModel):
    pass


class PeakDetectionParams(Annotator):
    signal_name: str
    prominence: float
    distance: int
    time_min: Optional[float]
    time_max: Optional[float]


class OutlierDetectionParams(Annotator):
    signal_name: str
    method: Literal["mad", "isoforest"]
    threshold: Optional[float] = None
    contamination: Optional[float] = None


class ChangePointDetectionParams(Annotator):
    signal_name: str
    method: Literal["pelt", "hmm"]
    num_points: int
    penalty: Optional[float] = None
    num_components: Optional[int] = None  # Only used if method is 'hmm'


class JumpDetectionParams(Annotator):
    signal_name: str
    threshold: float
    min_distance: int
    smoothing: float
    num_points: int


AnnotatorTypes = Union[
    PeakDetectionParams,
    OutlierDetectionParams,
    ChangePointDetectionParams,
    JumpDetectionParams,
]
