from typing import Annotated, Literal, Union
from pydantic import BaseModel, Field


class SmoothingStep(BaseModel):
    type: Literal["smoothing"] = "smoothing"
    signal_name: str
    method: Literal["gaussian", "uniform"] = "gaussian"
    sigma: float = Field(default=1.0, gt=0)


class BackgroundSubtractionStep(BaseModel):
    type: Literal["background_subtraction"] = "background_subtraction"
    signal_name: str
    window_size: int = Field(default=1000, gt=0)


class NormalisationStep(BaseModel):
    type: Literal["normalisation"] = "normalisation"
    signal_name: str
    method: Literal["zscore", "minmax"] = "zscore"


PreprocessingStep = Annotated[
    Union[SmoothingStep, BackgroundSubtractionStep, NormalisationStep],
    Field(discriminator="type"),
]


class PreprocessingConfig(BaseModel):
    steps: list[PreprocessingStep] = Field(default_factory=list)
