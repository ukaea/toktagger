from typing import List
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime

from services.api.schemas import Model
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


class Project(Model):
    name: str
    samples: List[Sample] = None
    task: Task
    query_strategy: QueryStrategyType
    data_loader: DataLoaderType
    timestamp: datetime = Field(default_factory=datetime.now)
