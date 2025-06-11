from pydantic import Field
from typing import Optional, List
from enum import Enum
from services.api.schemas import ConfiguredModel
from services.api.schemas.samples import SampleIn


class Task(Enum):
    ELM = "ELM"
    UFO = "UFO"


class QueryStrategyType(str, Enum):
    RANDOM = "random"
    SEQUENTIAL = "sequential"
    UNCERTAINTY = "uncertainty"


class DataLoaderType(str, Enum):
    PARQUET = "parquet"
    UDA = "uda"
    IMAGE = "image"


class ProjectIn(ConfiguredModel):
    name: str
    task: Task
    query_strategy: QueryStrategyType
    data_loader: DataLoaderType

class Project(ProjectIn):
    id: str = Field(..., alias="_id")