from typing import List
from pydantic import BaseModel, FilePath
from enum import Enum
from pydantic import Field
from services.api.schemas import ConfiguredModel

class ModelType(str, Enum): # Is this needed?
    DisruptionCNN = "disruption_cnn"

class ModelIn(ConfiguredModel):
    type: ModelType
    version: int
    accuracy: float
    # and whatever else we need....


class Model(ModelIn):
    id: str = Field(..., alias="_id")
    project_id: str
    
