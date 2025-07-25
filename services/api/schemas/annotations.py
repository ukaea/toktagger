from typing import Literal, Tuple, Optional, Union
from services.api.schemas import ConfiguredModel
from services.api.schemas.annotators import AnnotatorIds
from pydantic import Field, model_validator


class AnnotationIn(ConfiguredModel):
    label: str
    created_by: AnnotatorIds
    validated: bool = False
    uncertainty: Optional[float] = None

    @model_validator(mode="before")
    def set_uncertainty(cls, values):
        if values.get("validated"):
            values["uncertainty"] = 0
        elif not values.get("validated") and values.get("uncertainty") is None:
            values["uncertainty"] = 1

        return values


class ClassLabel(AnnotationIn):
    type: Literal["class_label"] = "class_label"


class TimePoint(AnnotationIn):
    type: Literal["time_point"] = "time_point"
    time: float


class TimeRegion(AnnotationIn):
    type: Literal["time_region"] = "time_region"
    time_min: float
    time_max: float


class BoundingBox(AnnotationIn):
    type: Literal["bounding_box"] = "bounding_box"
    height: float = None
    width: float = None
    centre: Tuple[float, float] = None


class VideoBoundingBox(BoundingBox):
    type: Literal["video_bounding_box"] = "video_bounding_box"
    frame: int


class Annotation(AnnotationIn):
    id: str = Field(..., alias="_id")
    project_id: str
    sample_id: str


class ModelAnnotation(AnnotationIn):
    uncertainty: float


AnnotationTypes = Union[
    ClassLabel, TimePoint, TimeRegion, BoundingBox, VideoBoundingBox
]
