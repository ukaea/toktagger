from typing import Tuple
from services.api.schemas import ConfiguredModel
from pydantic import Field

class AnnotationIn(ConfiguredModel):
    validated: bool = False
    label: str
    
class Annotation(AnnotationIn):
    id: str = Field(..., alias="_id")
    sample_id: int


class TimePoint(AnnotationIn):
    time: int


class TimeRegion(AnnotationIn):
    time_min: float
    time_max: float


class BoundingBox(AnnotationIn):
    height: float = None
    width: float = None
    centre: Tuple[float, float] = None


class VideoBoundingBox(BoundingBox):
    frame: int
