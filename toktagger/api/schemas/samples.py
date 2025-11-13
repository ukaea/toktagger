from typing import Annotated, List, Optional
from enum import Enum
from pydantic import Field, BaseModel
from toktagger.api.schemas import ConfiguredModel
from toktagger.api.schemas.annotations import AnnotationIn


class FileType(str, Enum):
    CSV = "csv"
    PARQUET = "parquet"
    MP4 = "mp4"
    PNG = "png"
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
    column_names: Optional[list[str]] = None


class ImageFileData(FileData):
    frame: int
    time: float


class ShotData(BaseModel):
    protocol: ShotProtocol
    signal_names: Annotated[list[str], Field(min_items=1)]


class SampleBase(ConfiguredModel):
    shot_id: int
    data: FileData | ShotData | TimeSeriesFileData


class SampleIn(SampleBase):
    annotations: Optional[List[AnnotationIn]] = None


class Sample(SampleBase):
    id: str = Field(..., alias="_id")
    project_id: str
