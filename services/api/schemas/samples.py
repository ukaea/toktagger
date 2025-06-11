from typing import Annotated, List, Optional
from enum import Enum
from pydantic import Field
from services.api.schemas import ConfiguredModel
from services.api.schemas.annotations import Annotation


class FileType(str, Enum):
    CSV = "csv"
    PARQUET = "parquet"
    MP4 = "mp4"
    PNG = "png"


class FileProtocol(str, Enum):
    S3 = "s3"
    LOCAL = "file"


class ShotProtocol(str, Enum):
    UDA = "uda"
    SAL = "sal"


class FileData(ConfiguredModel):
    file_name: str
    type: FileType
    protocol: FileProtocol = FileProtocol.LOCAL


class TimeSeriesFileData(FileData):
    column_names: Optional[list[str]]


class ImageFileData(FileData):
    frame: int
    time: int


class ShotData(ConfiguredModel):
    protocol: ShotProtocol
    signal_names: Annotated[list[str], Field(min_items=1)]


class Sample(ConfiguredModel):
    shot_id: int
    data: FileData | ShotData
    annotations: Optional[List[Annotation]] = None


class SampleOut(Sample):
    id: str = Field(..., alias="_id")
    project_id: str
