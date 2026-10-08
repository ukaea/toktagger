from enum import Enum
from typing import Literal, Optional, Union
from pydantic import BaseModel, Field, model_validator
from toktagger.api.schemas import ConfiguredModel


class ViewType(str, Enum):
    IDENTITY = "identity"
    PROFILE_2D = "profile_2d"


class STFTWindow(str, Enum):
    HANN = "hann"
    HAMMING = "hamming"
    BLACKMAN = "blackman"
    BOXCAR = "boxcar"


class STFTParams(BaseModel):
    nperseg: int = Field(256, ge=2)
    noverlap: int = Field(128, ge=0)
    window: STFTWindow = STFTWindow.HANN
    nfft: int | None = None

    @model_validator(mode="after")
    def check_segment_lengths(self) -> "STFTParams":
        if self.noverlap >= self.nperseg:
            raise ValueError("noverlap must be less than nperseg")
        if self.nfft is not None and self.nfft < self.nperseg:
            raise ValueError("nfft must be greater than or equal to nperseg")
        return self


class ViewParams(ConfiguredModel):
    name: Literal[ViewType.IDENTITY] = ViewType.IDENTITY


class Profile2DViewParams(ViewParams):
    name: Literal[ViewType.PROFILE_2D] = ViewType.PROFILE_2D
    signal_name: str
    time_min: Optional[float] = None
    time_max: Optional[float] = None
    dim_1_min: Optional[float] = None
    dim_1_max: Optional[float] = None
    values_min: Optional[float] = None
    values_max: Optional[float] = None
    log_scale: bool = False
    stft: STFTParams = Field(default_factory=STFTParams)


ViewParamTypes = Union[ViewParams, Profile2DViewParams]
