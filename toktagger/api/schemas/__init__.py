from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field, model_validator, ConfigDict
from bson.objectid import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException


class ConfiguredModel(BaseModel):
    timestamp: Optional[datetime] = Field(
        default_factory=datetime.now,
        description="Time when this object was created, leave blank to automatically generate.",
    )

    @model_validator(mode="before")
    def convert_objectid(cls, values):
        for key in ("_id", "project_id", "sample_id"):
            if key in values:
                values[key] = str(values.get(key))
        return values

    model_config = ConfigDict(
        use_enum_values=True, json_encoders={ObjectId: str}, validate_by_name=True
    )


def convert_to_objectid(id: str, collection: str):
    try:
        obj_id = ObjectId(id)
    except InvalidId:
        raise HTTPException(
            status_code=400, detail=f"{collection[:-1].title()} ID is not valid."
        )
    return obj_id
