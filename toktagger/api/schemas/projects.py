from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, computed_field, field_validator, model_validator

from toktagger.api.core.data_loaders import LoaderRegistry
from toktagger.api.schemas import ConfiguredModel


class Task(str, Enum):
    """The type of labelling task for a project."""

    TIME_SERIES = "time-series"
    PROFILE_2D = "profile-2d"
    VIDEO = "video"


class QueryStrategyType(str, Enum):
    """The strategy to use when selecting the next sample to annotate."""

    RANDOM = "random"
    SEQUENTIAL = "sequential"
    UNCERTAINTY = "uncertainty"


class AutoAddShots(BaseModel):
    """Settings to add new shots from the data source at a set interval."""

    enabled: bool = Field(False, description="Whether to check for new shots.")
    interval_minutes: int = Field(
        10, ge=1, description="The time (in minutes) between checks for new shots."
    )


class ProjectIn(ConfiguredModel):
    name: str = Field(..., description="The name of the project.")
    task: Task = Field(..., description="The type of labelling task.")
    query_strategy: QueryStrategyType = Field(
        ...,
        description="The strategy to use when selecting the next sample to annotate.",
    )

    data_loader: str = Field(
        ...,
        description="The type of data which will need to be loaded for this project.",
    )

    signal_names: list[str] = Field(
        default_factory=list,
        description="The signal names to load for every sample in this project.",
    )

    time_min: float | None = Field(
        None,
        description="The minimum time (in seconds) for samples in this project.",
    )

    time_max: float | None = Field(
        None,
        description="The maximum time (in seconds) for samples in this project.",
    )

    min_time_step: float | None = Field(
        None,
        description="The minimum time step (in seconds) between samples in this project.",
    )

    shot_labels: list[str] | None = Field(
        default=["Valid", "Invalid"],
        description="The list of labels to use for shot labelling (if applicable).",
    )

    time_region_labels: list[str] | None = Field(
        default=[
            "ELM",
            "L-mode",
            "H-mode",
            "Thermal Quench",
            "Current Quench",
            "Sawtooth",
            "IRE",
            "Locked Mode",
            "VDE",
            "Flat Top",
            "Ramp Up",
            "Ramp Down",
            "NTM",
            "LLM",
            "Sawteeth",
            "Unknown",
        ],
        description="The list of labels to use for time region labelling (if applicable).",
    )

    time_point_labels: list[str] | None = Field(
        default=[
            "Disruption",
            "Thermal Quench",
            "Current Quench",
            "Control Loss",
            "Locked Mode",
            "VDE",
        ],
        description="The list of labels to use for time point labelling (if applicable).",
    )

    bounding_box_labels: list[str] | None = Field(
        default=["NTM", "LLM", "Sawteeth", "Locked Mode"],
        description="The list of labels to use for bounding box labelling (if applicable).",
    )

    polygon_labels: list[str] | None = Field(
        default=["NTM", "LLM", "Sawteeth", "Locked Mode"],
        description="The list of labels to use for polygon labelling (if applicable).",
    )

    video_bounding_box_labels: list[str] | None = Field(
        default=[
            "UFO",
            "Minor UFO",
            "Major UFO",
            "MARFE",
            "Other Anomaly",
        ],
        description="The list of labels to use for video bounding box labelling (if applicable).",
    )

    auto_add_shots: AutoAddShots | None = Field(
        None,
        description="Settings to add new shots from the data source at a set interval (if applicable).",
    )

    @computed_field
    @property
    def model_types(self) -> list[str]:
        from toktagger.api.models import models_dependencies_installed

        if not models_dependencies_installed():
            return []
        from toktagger.api.models.base import ModelRegistry

        return ModelRegistry.names(Task(self.task))

    @field_validator("data_loader")
    def check_data_loader(cls, value):
        if value not in (names := LoaderRegistry.names()):
            raise ValueError(
                f"Invalid data loader '{value}' - valid options are '{names}'."
            )

        return value

    @model_validator(mode="after")
    def check_auto_add_shots(self):
        if self.auto_add_shots and not LoaderRegistry.supports_latest_shot(
            self.data_loader
        ):
            raise ValueError(
                f"Data loader '{self.data_loader}' does not support adding new shots automatically."
            )
        return self


class Project(ProjectIn):
    id: str = Field(..., alias="_id", description="The ID of this project.")
    shots_last_checked: datetime | None = Field(
        None, description="The time of the last check for new shots."
    )


class ProjectShotsChecked(BaseModel):
    shots_last_checked: datetime


class ProjectUpdate(BaseModel):
    """The project fields which can change after creation."""

    name: str | None = None
    query_strategy: QueryStrategyType | None = None
    signal_names: list[str] | None = None
    time_min: float | None = None
    time_max: float | None = None
    min_time_step: float | None = None
    shot_labels: list[str] | None = None
    time_region_labels: list[str] | None = None
    time_point_labels: list[str] | None = None
    bounding_box_labels: list[str] | None = None
    polygon_labels: list[str] | None = None
    video_bounding_box_labels: list[str] | None = None
    auto_add_shots: AutoAddShots | None = None


class ProjectMember(ConfiguredModel):
    role: Literal["admin", "annotator", "viewer"] = "annotator"
    show_others_annotations: bool = True


class ProjectMemberOut(ConfiguredModel):
    id: str = Field(..., alias="_id")
    project_id: str
    user_id: str
    username: str
    role: Literal["admin", "annotator", "viewer"]
    show_others_annotations: bool


class ProjectMemberCreate(BaseModel):
    username: str
    role: Literal["admin", "annotator", "viewer"] = "annotator"


class ProjectMemberUpdate(BaseModel):
    role: Literal["admin", "annotator", "viewer"] | None = None
    show_others_annotations: bool | None = None
