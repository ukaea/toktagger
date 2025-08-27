from typing import Literal, Optional, Union
from pydantic import BaseModel
from enum import Enum


class AnnotatorTypes(str, Enum):
    PEAK_DETECTION = "peak_detection"
    OUTLIER_DETECTION = "outlier_detection"
    CHANGE_POINT_DETECTION = "change_point_detection"
    JUMP_DETECTION = "jump_detection"
    MANUAL_ANNOTATION = "manual"


class DataTypes(Enum):
    TIME_SERIES = "time_series"
    IMAGE = "image"


class AnnotatorParams(BaseModel):
    pass


class PeakDetectionParams(AnnotatorParams):
    signal_name: str
    prominence: float
    distance: int
    time_min: Optional[float] = None
    time_max: Optional[float] = None


class OutlierDetectionParams(AnnotatorParams):
    signal_name: str
    method: Literal["mad", "isoforest"]
    threshold: Optional[float] = None
    contamination: Optional[float] = None


class ChangePointDetectionParams(AnnotatorParams):
    signal_name: str
    method: Literal["pelt", "hmm"]
    num_points: int
    penalty: Optional[float] = None
    num_components: Optional[int] = None  # Only used if method is 'hmm'


class JumpDetectionParams(AnnotatorParams):
    signal_name: str
    threshold: float
    min_distance: int
    smoothing: float
    num_points: int


AnnotatorParamTypes = Union[
    PeakDetectionParams,
    OutlierDetectionParams,
    ChangePointDetectionParams,
    JumpDetectionParams,
]
