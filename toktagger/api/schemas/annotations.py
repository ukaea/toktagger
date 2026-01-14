from typing import Literal, Optional, Union

from pydantic import Field, TypeAdapter, field_validator, model_validator

from toktagger.api.schemas import ConfiguredModel
from toktagger.api.schemas.annotators import AnnotatorTypes


class AnnotationIn(ConfiguredModel):
    label: str
    created_by: str
    validated: bool = False
    uncertainty: Optional[float] = None
    sample_id: Optional[str] = None
    project_id: Optional[str] = None

    @model_validator(mode="before")
    def set_uncertainty(cls, values):
        if isinstance(values, dict):
            if "validated" in values and values["validated"]:
                values["uncertainty"] = 0
            elif values.get("uncertainty") is None:
                values["uncertainty"] = 1
        return values

    @field_validator("created_by")
    def check_created_by(cls, value):
        from toktagger.api.models.base import ModelRegistry

        if value not in (models := ModelRegistry.names()) and value not in (
            annotators := [ann.value for ann in AnnotatorTypes]
        ):
            raise ValueError(
                f"Invalid created_by '{value}' - valid options are ML Models '{models}', or Annotators '{annotators}'."
            )
        return value


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
    height: int
    width: int
    x_min: int
    y_min: int


class VideoBoundingBox(BoundingBox):
    type: Literal["video_bounding_box"] = "video_bounding_box"
    frame: int
    track_id: str


class SpectrogramMask(AnnotationIn):
    type: Literal["spectrogram_mask"] = "spectrogram_mask"
    values: list[list[float]]


class PolygonAnnotation(AnnotationIn):
    type: Literal["polygon"] = "polygon"
    segmentation: list[list[float]]
    area: float
    bbox: list[float]  # [x, y, width, height]


class AnnotationOut(AnnotationIn):
    id: Optional[str] = Field(None, alias="_id")
    project_id: Optional[str] = None
    sample_id: Optional[str] = None


class TimePointOut(TimePoint, AnnotationOut):
    pass


class TimeRegionOut(TimeRegion, AnnotationOut):
    pass


class BoundingBoxOut(BoundingBox, AnnotationOut):
    pass


class VideoBoundingBoxOut(VideoBoundingBox, AnnotationOut):
    pass


class SpectrogramMaskOut(SpectrogramMask, Annotation):
    pass


class PolygonAnnotationOut(PolygonAnnotation, Annotation):
    pass


class ModelAnnotation(AnnotationIn):
    uncertainty: float
    created_by: str


AnnotationTypes = Union[
    TimePoint,
    TimeRegion,
    BoundingBox,
    VideoBoundingBox,
    SpectrogramMask,
    PolygonAnnotation,
]

AnnotationOutTypes = Union[
    TimePointOut,
    TimeRegionOut,
    BoundingBoxOut,
    VideoBoundingBoxOut,
    SpectrogramMaskOut,
    PolygonAnnotationOut,
]

AnnotationBatchInputTypes = AnnotationOutTypes

AnnotationTypeAdapter = TypeAdapter(AnnotationTypes)
AnnotationOutTypeAdapter = TypeAdapter(AnnotationOutTypes)
AnnotationBatchInputTypeAdapter = TypeAdapter(AnnotationBatchInputTypes)
