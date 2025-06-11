from pydantic import Field
from enum import Enum
from services.api.schemas import ConfiguredModel


class Task(Enum):
    ELM = "ELM"
    DISRUPTION = "disruption"
    UFO = "UFO"


class QueryStrategyType(str, Enum):
    RANDOM = "random"
    SEQUENTIAL = "sequential"


class DataLoaderType(str, Enum):
    PARQUET = "parquet"
    UDA = "uda"
    IMAGE = "image"


class Project(ConfiguredModel):
    name: str
    task: Task
    query_strategy: QueryStrategyType
    data_loader: DataLoaderType


class ProjectOut(Project):
    id: str = Field(..., alias="_id")
