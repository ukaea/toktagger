from typing import Literal, Tuple, Optional, Union
from toktagger.api.schemas import ConfiguredModel
from toktagger.api.schemas.annotators import AnnotatorTypes
from pydantic import Field, TypeAdapter, model_validator, BaseModel


class AnnotationIn(ConfiguredModel):
    label: str
    created_by: AnnotatorTypes
    validated: bool = False
    uncertainty: Optional[float] = None
    sample_id: Optional[str] = None
    project_id: Optional[str] = None

    @model_validator(mode="before")
    def set_uncertainty(cls, values):
        if isinstance(values, dict):
            if values["validated"]:
                values["uncertainty"] = 0
            elif values.get("uncertainty") is None:
                values["uncertainty"] = 1
        return values


class Annotation(AnnotationIn):
    id: str = Field(..., alias="_id")


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


class SpectrogramMask(AnnotationIn):
    values: list[list[float]]


AnnotationTypes = Union[TimePoint, TimeRegion, BoundingBox, VideoBoundingBox]
AnnotationOutTypes = Union[
    TimePointOut, TimeRegionOut, BoundingBoxOut, VideoBoundingBoxOut
]
AnnotationTypeAdapter = TypeAdapter(AnnotationTypes)
AnnotationOutTypeAdapter = TypeAdapter(AnnotationOutTypes)
