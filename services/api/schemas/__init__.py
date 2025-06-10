from pydantic import BaseModel, Field, model_validator
from bson.objectid import ObjectId
from datetime import datetime

class ConfiguredModel(BaseModel):
    timestamp: datetime = Field(default_factory=datetime.now)
    @model_validator(mode='before')
    def convert_objectid(cls, values):
        if _id := values.get("_id"):
            values['_id'] = str(_id)
        return values
    
    class Config:
        use_enum_values = True
        json_encoders = {ObjectId: str}
        validate_by_name = True
        
