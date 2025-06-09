from datetime import datetime
from typing import Tuple
from services.api.schemas import Model

class Annotation(Model):
    validated: bool = False
    label: str
    
class AnnotationOut(Annotation):
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
