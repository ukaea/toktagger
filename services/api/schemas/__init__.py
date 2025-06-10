from pydantic import BaseModel, Field, model_validator
from bson.objectid import ObjectId
from datetime import datetime
from bson.errors import InvalidId
from fastapi import HTTPException


class ConfiguredModel(BaseModel):
    timestamp: datetime = Field(default_factory=datetime.now)

    @model_validator(mode="before")
    def convert_objectid(cls, values):
        for key in ("_id", "project_id", "sample_id"):
            if _id := values.get(key):
                values[key] = str(_id)
        return values

    class Config:
        use_enum_values = True
        json_encoders = {ObjectId: str}
        validate_by_name = True


def convert_to_objectid(id: str, collection: str):
    try:
        obj_id = ObjectId(id)
    except InvalidId as e:
        raise HTTPException(
            status_code=400, detail=f"{collection.title()} ID is not valid."
        )
    return obj_id
