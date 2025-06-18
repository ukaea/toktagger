from enum import Enum
from typing import Optional, Union
from services.api.schemas import ConfiguredModel


class ViewType(str, Enum):
    IDENTITY = "identity"
    SPECTROGRAM = "spectrogram"


class ViewParams(ConfiguredModel):
    name: ViewType = ViewType.IDENTITY


class SpectrogramViewParams(ViewParams):
    nperseg: Optional[int] = 256
    time_min: Optional[float] = None
    time_max: Optional[float] = None
    frequency_min: Optional[float] = None
    frequency_max: Optional[float] = None


ViewParamTypes = Union[ViewParams, SpectrogramViewParams]
