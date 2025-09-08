from typing import Annotated, List, Optional
from enum import Enum
from pydantic import Field, computed_field, BaseModel
from services.common.schemas import ConfiguredModel
from services.common.schemas.annotations import AnnotationTypes


class FileType(str, Enum):
    CSV = "csv"
    PARQUET = "parquet"
    MP4 = "mp4"
    PNG = "png"
    JSON = "json"
    JPG = "jpg"


class FileProtocol(str, Enum):
    S3 = "s3"
    LOCAL = "file"


class ShotProtocol(str, Enum):
    UDA = "uda"
    SAL = "sal"


class FileData(BaseModel):
    file_name: str
    type: FileType
    protocol: FileProtocol = FileProtocol.LOCAL


class TimeSeriesFileData(FileData):
    signal_names: Optional[list[str]] = None


class ImageFileData(FileData):
    frame: int
    time: float


class ShotData(BaseModel):
    protocol: ShotProtocol
    signal_names: Annotated[list[str], Field(min_items=1)]


class SampleBase(ConfiguredModel):
    shot_id: int
    data: FileData | ShotData | TimeSeriesFileData | ImageFileData


class SampleIn(SampleBase):
    annotations: Optional[List[AnnotationTypes]] = None
    
    @computed_field
    @property
    def validated_annotations(self) -> bool:
        if not self.annotations:
            return False
        
        return any([annotation.validated for annotation in self.annotations]) # TODO any or all?


class Sample(SampleBase):
    validated_annotations: bool
    id: str = Field(..., alias="_id")
    project_id: str

class SampleUpdate(ConfiguredModel):
    validated_annotations: Optional[bool] = None