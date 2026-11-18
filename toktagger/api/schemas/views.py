from enum import Enum
from typing import Literal

from toktagger.api.schemas import ConfiguredModel


class ViewType(str, Enum):
    IDENTITY = "identity"
    PROFILE_2D = "profile_2d"
    RADIAL_PROFILE = "radial_profile"


class ViewParams(ConfiguredModel):
    name: Literal[ViewType.IDENTITY] = ViewType.IDENTITY


class Profile2DViewParams(ViewParams):
    name: Literal[ViewType.PROFILE_2D] = ViewType.PROFILE_2D
    signal_name: str
    time_min: float | None = None
    time_max: float | None = None
    dim_1_min: float | None = None
    dim_1_max: float | None = None
    values_min: float | None = None
    values_max: float | None = None
    log_scale: bool = False


class RadialProfileViewParams(ViewParams):
    name: Literal[ViewType.RADIAL_PROFILE] = ViewType.RADIAL_PROFILE


ViewParamTypes = ViewParams | Profile2DViewParams | RadialProfileViewParams
