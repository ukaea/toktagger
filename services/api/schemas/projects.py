from typing import List
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime
from bson.objectid import ObjectId
from services.api.schemas import ConfiguredModel
from services.api.schemas.samples import Sample


class Task(Enum):
    ELM = "ELM"
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