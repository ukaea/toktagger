from pydantic import Field
from enum import Enum
from services.api.schemas import ConfiguredModel


class Task(Enum):
    ELM = "ELM"
    DISRUPTION = "disruption"
    MHD = "MHD"
    UFO = "UFO"


class QueryStrategyType(str, Enum):
    RANDOM = "random"
    SEQUENTIAL = "sequential"
    UNCERTAINTY = "uncertainty"


class DataLoaderType(str, Enum):
    PARQUET = "parquet"
    UDA = "uda"
    SAL = "sal"
    IMAGE = "image"


class ProjectIn(ConfiguredModel):
    name: str = Field(..., description="The name of the project.")
    task: Task = Field(..., description="The type of labelling task.")
    query_strategy: QueryStrategyType = Field(
        ...,
        description="The strategy to use when selecting the next sample to annotate.",
    )
    data_loader: DataLoaderType = Field(
        ...,
        description="The type of data which will need to be loaded for this project.",
    )


class Project(ProjectIn):
    id: str = Field(..., alias="_id", description="The ID of this project.")
