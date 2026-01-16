from enum import Enum
from typing import Literal, Optional, Union
from pydantic import BaseModel


class ViewType(str, Enum):
    IDENTITY = "identity"
    SPECTROGRAM = "spectrogram"


class ViewParams(BaseModel):
    name: Literal[ViewType.IDENTITY] = ViewType.IDENTITY


class SpectrogramViewParams(ViewParams):
    name: Literal[ViewType.SPECTROGRAM] = ViewType.SPECTROGRAM
    nperseg: Optional[int] = 256
    time_min: Optional[float] = None
    time_max: Optional[float] = None
    frequency_min: Optional[float] = None
    frequency_max: Optional[float] = None
    amplitude_min: Optional[float] = None
    amplitude_max: Optional[float] = None
    threshold_value: Optional[float] = None


ViewParamTypes = Union[ViewParams, SpectrogramViewParams]
