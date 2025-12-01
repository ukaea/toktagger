from pydantic import Field, field_validator
from typing import Optional
from enum import Enum
from toktagger.api.schemas import ConfiguredModel
from toktagger.api.core.data_loaders import LoaderRegistry


class Task(Enum):
    ELM = "ELM"
    DISRUPTION = "disruption"
    MHD = "MHD"
    UFO = "UFO"


class QueryStrategyType(str, Enum):
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
