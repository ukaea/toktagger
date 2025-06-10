from typing import Tuple
from services.api.schemas import ConfiguredModel
from pydantic import Field

class Annotation(ConfiguredModel):
    validated: bool = False
    label: str
    
class AnnotationOut(Annotation):
    id: str = Field(..., alias="_id")
    sample_id: int


class TimePoint(Annotation):
    time: int


class TimeRegion(Annotation):
    time_min: float
    time_max: float


class BoundingBox(Annotation):
    height: float = None
    width: float = None
    centre: Tuple[float, float] = None


class VideoBoundingBox(BoundingBox):
    frame: int
