from typing import Annotated, Optional, Union
from enum import Enum
from pydantic import Field, BaseModel
from toktagger.api.schemas import ConfiguredModel


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


DataTypes = Union[TimeSeriesFileData, FileData, ShotData, ImageFileData]


class SampleBase(ConfiguredModel):
    shot_id: int
    data: DataTypes


class SampleIn(SampleBase):
    pass


class Sample(SampleBase):
    id: str = Field(..., alias="_id")
    project_id: str


class SampleSummary(BaseModel):
    total: int
    shot_min: Optional[int] = None
    shot_max: Optional[int] = None
    data: Optional[DataTypes] = None
