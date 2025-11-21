from typing import Annotated, List, Optional, Union, Literal
from enum import Enum
from pydantic import Field, BaseModel
from toktagger.api.schemas import ConfiguredModel
from toktagger.api.schemas.annotations import AnnotationIn


class FileType(str, Enum):
    CSV = "csv"
    TSV = "tsv"
    PARQUET = "parquet"
    FEATHER = "feather"
    JSON = "json"
    XLSX = "xlsx"
    MP4 = "mp4"
    PNG = "png"
    JPG = "jpg"


class FileProtocol(str, Enum):
    S3 = "s3"
    LOCAL = "file"


class ShotProtocol(str, Enum):
    UDA = "uda"
    SAL = "sal"
    TOKSEARCH = "toksearch"


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


class ToksearchShotData(ShotData):
    backend_type: Literal["zarr"]
    base_path: str
    endpoint: str


DataTypes = Union[
    TimeSeriesFileData, FileData, ShotData, ImageFileData, ToksearchShotData
]


class SampleBase(ConfiguredModel):
    shot_id: int
    data: DataTypes


class SampleIn(SampleBase):
    annotations: Optional[List[AnnotationIn]] = None


class Sample(SampleBase):
    id: str = Field(..., alias="_id")
    project_id: str


class SampleSummary(BaseModel):
    total: int
    shot_min: Optional[int] = None
    shot_max: Optional[int] = None
    data: Optional[DataTypes] = None
