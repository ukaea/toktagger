from typing import Tuple, Optional, Union
from services.common.schemas import ConfiguredModel
from services.common.schemas.models import ModelType
from pydantic import Field, TypeAdapter, model_validator, BaseModel


class AnnotationIn(ConfiguredModel):
    @model_validator(mode="before")
    def set_uncertainty(cls, values):
        if not isinstance(values, dict):
            values = values.model_dump(mode="python")
            
        if values.get("validated"):
            values["uncertainty"] = 0
        elif not values.get("validated") and values.get("uncertainty") is None:
            values["uncertainty"] = 1

        return values

    validated: bool = False
    uncertainty: Optional[float] = None
    label: str
    created_by: Optional[ModelType] = None # TODO: this should also contain annotators


class TimePoint(AnnotationIn):
    time: float


class TimeRegion(AnnotationIn):
    time_min: float
    time_max: float


class BoundingBox(AnnotationIn):
    height: float
    width: float
    centre: Tuple[float, float]


class VideoBoundingBox(BoundingBox):
    frame: int


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
    created_by: ModelType


class SpectrogramMask(AnnotationIn):
    values: list[list[float]]


AnnotationTypes = Union[TimePoint, TimeRegion, BoundingBox, VideoBoundingBox]
AnnotationOutTypes = Union[
    TimePointOut, TimeRegionOut, BoundingBoxOut, VideoBoundingBoxOut
]

class AnnotationBatchItem(ConfiguredModel):
    sample_id: str
    annotations: list[AnnotationTypes]

AnnotationTypeAdapter = TypeAdapter(AnnotationTypes)
AnnotationOutTypeAdapter = TypeAdapter(AnnotationOutTypes)