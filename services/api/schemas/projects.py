from pydantic import Field, computed_field
from enum import Enum
from services.api.schemas import ConfiguredModel
from typing import List
from services.api.schemas.models import ModelType
class Task(Enum):
    ELM = "ELM"
    DISRUPTION = "disruption"
    MHD = "MHD"
    UFO = "UFO"
    
MODELS_PER_TASK = {
    Task.DISRUPTION: ["disruption_cnn"]
}

class QueryStrategyType(str, Enum):
    RANDOM = "random"
    SEQUENTIAL = "sequential"
    UNCERTAINTY = "uncertainty"


class DataLoaderType(str, Enum):
    PARQUET = "parquet"
    UDA = "uda"
    IMAGE = "image"
    JSON = "json"


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

    @computed_field
    @property
    def model_types(self) -> List[ModelType]:
        return MODELS_PER_TASK[Task(self.task)]

class Project(ProjectIn):
    id: str = Field(..., alias="_id", description="The ID of this project.")
    