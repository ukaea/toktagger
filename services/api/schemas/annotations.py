from typing import Tuple, Optional, Union
from services.api.schemas import ConfiguredModel
from pydantic import Field, model_validator


class AnnotationIn(ConfiguredModel):
    label: str
    validated: bool = False
    uncertainty: Optional[float] = None

    @model_validator(mode="before")
    def set_uncertainty(cls, values):
        if values.get("validated"):
            values["uncertainty"] = 0
        elif not values.get("validated") and values.get("uncertainty") is None:
            values["uncertainty"] = 1

        return values


class TimePoint(AnnotationIn):
    time: float


class TimeRegion(AnnotationIn):
    time_min: float
    time_max: float


class BoundingBox(AnnotationIn):
    height: float = None
    width: float = None
    centre: Tuple[float, float] = None


class VideoBoundingBox(BoundingBox):
    frame: int


class Annotation(AnnotationIn):
    id: str = Field(..., alias="_id")
    project_id: str
    sample_id: str


class ModelAnnotation(AnnotationIn):
    uncertainty: float


AnnotationTypes = Union[TimePoint, TimeRegion, BoundingBox, VideoBoundingBox]
