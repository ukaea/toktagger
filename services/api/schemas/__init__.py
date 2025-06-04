import pydantic

class Model(pydantic.BaseModel):
    class Config:
        use_enum_values = True