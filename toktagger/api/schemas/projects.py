from pydantic import BaseModel, Field, field_validator
from typing import Optional
from enum import Enum
from toktagger.api.schemas import ConfiguredModel
from toktagger.api.core.data_loaders import LoaderRegistry


class Task(str, Enum):
    TIME_SERIES = "time_series"
    SPECTROGRAM = "spectrogram"
    VIDEO = "video"


class QueryStrategyType(str, Enum):
    RANDOM = "random"
    SEQUENTIAL = "sequential"
    UNCERTAINTY = "uncertainty"


class ProjectDataLoader(BaseModel):
    name: str = Field(
        ...,
        description="The type of data which will need to be loaded for this project.",
    )

    max_sample_rate: float = Field(
        1e-4,
        description="The maximum sample rate of the data in Hz (if applicable).",
    )

    tmin: Optional[float] = Field(
        None,
        description="The minimum time value to include in this project (if applicable).",
    )

    tmax: Optional[float] = Field(
        None,
        description="The maximum time value to include in this project (if applicable).",
    )

    @field_validator("name")
    def check_data_loader(cls, value):
        if value not in (names := LoaderRegistry.names()):
            raise ValueError(
                f"Invalid data loader '{value}' - valid options are '{names}'."
            )

        return value


class ShotDataLoader(ProjectDataLoader):
    shot_min: int = Field(
        ..., description="The minimum shot number to include in this project."
    )
    shot_max: int = Field(
        ..., description="The maximum shot number to include in this project."
    )


class FileDataLoader(ProjectDataLoader):
    file_path: str = Field(
        ..., description="The path to the data files for this project."
    )


ProjectDataLoaderTypes = FileDataLoader | ShotDataLoader


class TaskTypes(BaseModel):
    name: str = Field(..., description="The name of the task.")
    type: Task = Field(..., description="The type of task.")
    signal_names: list[str] = Field(
        ..., description="List of signal names relevant to this time series task."
    )
    class_labels: list[str] = Field(
        [],
        description="List of class labels for classification tasks.",
    )


class ProjectIn(ConfiguredModel):
    name: str = Field(..., description="The name of the project.")

    data_loader: ProjectDataLoaderTypes = Field(
        ...,
        description="The data loader configuration for this project.",
    )

    tasks: list[TaskTypes] = Field(
        ..., description="The tasks associated with this project."
    )

    query_strategy: QueryStrategyType = Field(
        ...,
        description="The strategy to use when selecting the next sample to annotate.",
    )


class Project(ProjectIn):
    id: str = Field(..., alias="_id", description="The ID of this project.")


class ProjectUpdate(ConfiguredModel):
    name: Optional[str] = None
    task: Optional[Task] = None
    query_strategy: Optional[QueryStrategyType] = None
