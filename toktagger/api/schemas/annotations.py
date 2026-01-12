from typing import Literal, Optional, Union
from toktagger.api.schemas import ConfiguredModel
from toktagger.api.schemas.annotators import AnnotatorTypes
from pydantic import Field, TypeAdapter, model_validator, BaseModel, field_validator


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
            if "validated" in values and values["validated"]:
                values["uncertainty"] = 0
            elif values.get("uncertainty") is None:
                values["uncertainty"] = 1
        return values

    validated: bool = False
    uncertainty: Optional[float] = None
    label: str
    created_by: str

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
    created_by: str


class SpectrogramMask(AnnotationIn):
    type: Literal["spectrogram_mask"] = "spectrogram_mask"
    values: list[list[float]]


class SpectrogramMaskOut(SpectrogramMask, Annotation):
    pass


AnnotationTypes = Union[
    TimePoint, TimeRegion, BoundingBox, VideoBoundingBox, SpectrogramMask
]
AnnotationOutTypes = Union[
    TimePointOut, TimeRegionOut, BoundingBoxOut, VideoBoundingBoxOut, SpectrogramMaskOut
]
AnnotationOutTypes = Union[
    Annotation, TimePointOut, TimeRegionOut, BoundingBoxOut, VideoBoundingBoxOut
]


class AnnotationBatchItem(ConfiguredModel):
    sample_id: str
    annotations: list[AnnotationTypes]


AnnotationTypeAdapter = TypeAdapter(AnnotationTypes)
AnnotationOutTypeAdapter = TypeAdapter(AnnotationOutTypes)
