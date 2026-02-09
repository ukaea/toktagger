from typing import Literal, Optional, Union

from pydantic import Field, TypeAdapter, create_model, field_validator, model_validator

from toktagger.api.schemas import ConfiguredModel
from toktagger.api.schemas.annotators import AnnotatorTypes


class AnnotationBase(ConfiguredModel):
    """Base class for annotation inputs, without IDs."""

    label: str
    created_by: str
    validated: bool = False
    uncertainty: Optional[float] = 1

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


class Annotation(AnnotationBase):
    id: str = Field(..., alias="_id")


class ClassLabel(AnnotationBase):
    type: Literal["class_label"] = "class_label"


class TimePoint(AnnotationBase):
    type: Literal["time_point"] = "time_point"
    time: float


class TimeRegion(AnnotationBase):
    type: Literal["time_region"] = "time_region"
    time_min: float
    time_max: float


class BoundingBox(AnnotationBase):
    type: Literal["bounding_box"] = "bounding_box"
    height: int
    width: int
    x_min: int
    y_min: int


class VideoBoundingBox(BoundingBox):
    type: Literal["video_bounding_box"] = "video_bounding_box"
    frame: int
    track_id: str


class SpectrogramMask(AnnotationBase):
    type: Literal["spectrogram_mask"] = "spectrogram_mask"
    values: list[list[float]]


class AnnotationBatch(AnnotationBase):
    """Base class for batch annotation inputs, with or without IDs."""

    id: Optional[str] = Field(None, alias="_id")
    project_id: Optional[str] = None
    sample_id: Optional[str] = None
    shot_id: Optional[int] = None


class AnnotationOut(AnnotationBatch):
    """Base class for annotation outputs coming from the database, with IDs."""

    id: str = Field(alias="_id")
    project_id: str
    sample_id: str
    shot_id: int


def create_out_model(base_class, name_suffix="Out"):
    """Create an Out variant of an annotation class by combining it with AnnotationOut."""
    class_name = f"{base_class.__name__}{name_suffix}"
    return create_model(
        class_name,
        __base__=(base_class, AnnotationOut),
    )


def create_batch_model(base_class, name_suffix="Batch"):
    """Create a Batch variant of an annotation class by combining it with AnnotationBatch."""
    class_name = f"{base_class.__name__}{name_suffix}"
    return create_model(
        class_name,
        __base__=(base_class, AnnotationBatch),
    )


# Generate Out classes using factory function
TimePointOut = create_out_model(TimePoint)
TimeRegionOut = create_out_model(TimeRegion)
BoundingBoxOut = create_out_model(BoundingBox)
VideoBoundingBoxOut = create_out_model(VideoBoundingBox)
SpectrogramMaskOut = create_out_model(SpectrogramMask)
ClassLabelOut = create_out_model(ClassLabel)

# Generate Batch classes using factory function
TimePointBatch = create_batch_model(TimePoint)
TimeRegionBatch = create_batch_model(TimeRegion)
BoundingBoxBatch = create_batch_model(BoundingBox)
VideoBoundingBoxBatch = create_batch_model(VideoBoundingBox)
SpectrogramMaskBatch = create_batch_model(SpectrogramMask)
ClassLabelBatch = create_batch_model(ClassLabel)


# Union types for annotations
AnnotationTypes = Union[
    TimePoint, TimeRegion, BoundingBox, VideoBoundingBox, SpectrogramMask, ClassLabel
]

AnnotationOutTypes = Union[
    TimePointOut,
    TimeRegionOut,
    BoundingBoxOut,
    VideoBoundingBoxOut,
    SpectrogramMaskOut,
    ClassLabelOut,
]

AnnotationBatchTypes = Union[
    TimePointBatch,
    TimeRegionBatch,
    BoundingBoxBatch,
    VideoBoundingBoxBatch,
    SpectrogramMaskBatch,
    ClassLabelBatch,
]

# TypeAdapters for annotations
AnnotationTypeAdapter = TypeAdapter(AnnotationTypes)
AnnotationOutTypeAdapter = TypeAdapter(AnnotationOutTypes)
AnnotationBatchTypeAdapter = TypeAdapter(AnnotationBatchTypes)
