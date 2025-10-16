from enum import Enum
from typing import Optional, Union
from toktagger.api.schemas import ConfiguredModel


class ViewType(str, Enum):
    IDENTITY = "identity"
    SPECTROGRAM = "spectrogram"
    IMAGE = "image"


class ViewParams(ConfiguredModel):
    name: ViewType = ViewType.IDENTITY


class SpectrogramViewParams(ViewParams):
    nperseg: Optional[int] = 256
    time_min: Optional[float] = None
    time_max: Optional[float] = None
    frequency_min: Optional[float] = None
    frequency_max: Optional[float] = None
    amplitude_min: Optional[float] = None
    amplitude_max: Optional[float] = None
    threshold_value: Optional[float] = None


class ImageViewParams(ViewParams):
    resize_fraction: Optional[float] = 1.0


ViewParamTypes = Union[ViewParams, SpectrogramViewParams, ImageViewParams]
