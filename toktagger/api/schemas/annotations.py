from typing import Literal, Tuple, Optional, Union
from toktagger.api.schemas import ConfiguredModel
from toktagger.api.schemas.models import ModelType
from toktagger.api.schemas.annotators import AnnotatorTypes
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
    created_by: Union[AnnotatorTypes, ModelType]


class Annotation(AnnotationIn):
    id: str = Field(..., alias="_id")
    project_id: Optional[str] = None
    sample_id: Optional[str] = None


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
    height: Optional[float] = None
    width: Optional[float] = None
    centre: Optional[Tuple[float, float]] = None


class VideoBoundingBox(BoundingBox):
    type: Literal["video_bounding_box"] = "video_bounding_box"
    frame: int


class AnnotationOut(BaseModel):
    id: str = Field(..., alias="_id")
    created_by: AnnotatorTypes
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
