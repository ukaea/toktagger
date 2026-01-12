from enum import Enum
from typing import Optional

from pydantic import Field, field_validator

from toktagger.api.core.data_loaders import LoaderRegistry
from toktagger.api.schemas import ConfiguredModel


class Task(str, Enum):
    """The type of labelling task for a project."""

    TIME_SERIES = "time-series"
    SPECTROGRAM = "spectrogram"
    VIDEO = "video"


class QueryStrategyType(str, Enum):
    """The strategy to use when selecting the next sample to annotate."""

    RANDOM = "random"
    SEQUENTIAL = "sequential"
    UNCERTAINTY = "uncertainty"


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

    time_min: Optional[float] = Field(
        None,
        description="The minimum time (in seconds) for samples in this project.",
    )

    time_max: Optional[float] = Field(
        None,
        description="The maximum time (in seconds) for samples in this project.",
    )

    min_time_step: Optional[float] = Field(
        None,
        description="The minimum time step (in seconds) between samples in this project.",
    )

    @field_validator("data_loader")
    def check_data_loader(cls, value):
        if value not in (names := LoaderRegistry.names()):
            raise ValueError(
                f"Invalid data loader '{value}' - valid options are '{names}'."
            )

        return value


class Project(ProjectIn):
    id: str = Field(..., alias="_id", description="The ID of this project.")


class ProjectUpdate(ConfiguredModel):
    name: Optional[str] = None
    task: Optional[Task] = None
    query_strategy: Optional[QueryStrategyType] = None
    time_min: Optional[float] = None
    time_max: Optional[float] = None
    min_time_step: Optional[float] = None
