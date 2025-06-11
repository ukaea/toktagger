from typing import Tuple, Optional
from services.api.schemas import ConfiguredModel
from pydantic import Field, model_validator

class AnnotationIn(ConfiguredModel):
    @model_validator(mode='before')
    def set_uncertainty(cls, values):
        if values.get("validated"):
            values['uncertainty'] = 0
        elif not values.get("validated") and values.get("uncertainty") is None:
            values['uncertainty'] = 1
            
        return values
    
    validated: bool = False
    uncertainty: Optional[float] = None
    label: str

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
    

class Annotation(AnnotationIn):
    id: str = Field(..., alias="_id")
    sample_id: int


class ModelAnnotation(Annotation):
    uncertainty: float