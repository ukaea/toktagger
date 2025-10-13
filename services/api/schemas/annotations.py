from typing import Optional, Union
from services.api.schemas import ConfiguredModel
from pydantic import Field, model_validator, BaseModel


class AnnotationIn(ConfiguredModel):
    @model_validator(mode="before")
    def set_uncertainty(cls, values):
        if values.get("validated"):
            values["uncertainty"] = 0
        elif not values.get("validated") and values.get("uncertainty") is None:
            values["uncertainty"] = 1

        return values

    validated: bool = False
    uncertainty: Optional[float] = None
    label: str


class TimePoint(AnnotationIn):
    time: float


class TimeRegion(AnnotationIn):
    time_min: float
    time_max: float


class BoundingBox(AnnotationIn):
    height: int
    width: int
    x_min: int
    y_min: int


class VideoBoundingBox(BoundingBox):
    frame: int
    track_id: str


class Annotation(BaseModel):
    id: str = Field(..., alias="_id")
    project_id: str
    sample_id: str


class TimePointOut(TimePoint, Annotation):
    pass


class TimeRegionOut(TimeRegion, Annotation):
    pass


class BoundingBoxOut(BoundingBox, Annotation):
    pass


class VideoBoundingBoxOut(VideoBoundingBox, Annotation):
    pass


class ModelAnnotation(AnnotationIn):
    uncertainty: float


class SpectrogramMask(AnnotationIn):
    values: list[list[float]]


AnnotationTypes = Union[TimePoint, TimeRegion, BoundingBox, VideoBoundingBox]
AnnotationOutTypes = Union[
    TimePointOut, TimeRegionOut, BoundingBoxOut, VideoBoundingBoxOut
]
