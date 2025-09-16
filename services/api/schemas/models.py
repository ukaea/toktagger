from typing import Literal, Annotated, Optional
from enum import Enum
from pydantic import Field
from services.api.schemas import ConfiguredModel


class ModelType(str, Enum):  # Is this needed?
    DisruptionCNN = "disruption_cnn"


class ModelIn(ConfiguredModel):
    type: ModelType
    version: int
    training_status: Literal["queued", "started", "failed", "completed", "aborted"]
    progress: Annotated[float, Field(strict=True, ge=0, le=100)]
    accuracy: Annotated[float, Field(strict=True, ge=0, le=100)]
    task_id: Optional[str] | None = None
    # and whatever else we need....


class ModelUpdate(ConfiguredModel):
    training_status: Optional[
        Literal["queued", "started", "failed", "completed", "aborted"]
    ] = None
    progress: Optional[Annotated[float, Field(strict=True, ge=0, le=100)]] = None
    accuracy: Optional[float] = None
    task_id: Optional[str] = None


class Model(ModelIn):
    id: str = Field(..., alias="_id")
    project_id: str
