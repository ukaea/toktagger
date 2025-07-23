from typing import Optional, Union
from pydantic import BaseModel
from enum import Enum


class AnnotatorIds(str, Enum):
    FIND_PEAKS = "find_peaks"
    MEAN_ABSOLUTE_DEVIATION = "mean_absolute_deviation"
    ISOFOREST_OUTLIERS = "isoforest_outliers"
    CHANGE_POINT_DETECTION = "change_point_detection"
    JUMP_DETECTION = "jump_detection"


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


class MeanAbsoluteDeviationOutliersParams(Annotator):
    signal_name: str
    threshold: float


class IsoforestOutliersParams(Annotator):
    signal_name: str
    contamination: float


class ChangePointDetectionParams(Annotator):
    signal_name: str
    penalty: float
    num_points: int


class JumpDetectionParams(Annotator):
    signal_name: str
    threshold: float
    min_distance: int
    smoothing: float
    num_points: int


AnnotatorTypes = Union[
    FindPeaksParams,
    MeanAbsoluteDeviationOutliersParams,
    IsoforestOutliersParams,
    ChangePointDetectionParams,
    JumpDetectionParams,
]
