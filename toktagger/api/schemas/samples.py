from typing import Annotated, List, Optional, Union
from enum import Enum
from pydantic import Field, BaseModel, computed_field
from toktagger.api.schemas import ConfiguredModel
from toktagger.api.schemas.annotations import AnnotationBatchTypes


class FileType(str, Enum):
    CSV = "csv"
    PARQUET = "parquet"
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
    signal_names: Optional[list[str]] = None


class ShotData(BaseModel):
    protocol: ShotProtocol
    signal_names: Annotated[list[str], Field(min_length=1)]


DataTypes = Union[TimeSeriesFileData, FileData, ShotData]


class SampleBase(ConfiguredModel):
    shot_id: int
    data: DataTypes


class SampleIn(SampleBase):
    annotations: Optional[List[AnnotationBatchTypes]] = None

    @computed_field
    @property
    def validated_annotations(self) -> bool:
        if not self.annotations:
            return False

        return any(
            [annotation.validated for annotation in self.annotations]
        )  # TODO any or all?


class Sample(SampleBase):
    validated_annotations: bool
    id: str = Field(..., alias="_id")
    project_id: str


class SampleUpdate(ConfiguredModel):
    validated_annotations: Optional[bool] = None


class SampleUpdateBatchItem(ConfiguredModel):
    id: str = Field(..., alias="_id")
    updates: SampleUpdate


class SampleSummary(BaseModel):
    total: int
    shot_min: Optional[int] = None
    shot_max: Optional[int] = None
    data: Optional[DataTypes] = None
