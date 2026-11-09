import pathlib
import typing

import numpy as np
import pydantic
import torch
from tokeye.hub import download_model
from tokeye.inference import infer
from tokeye.models.big_tf_unet.config_big_tf_unet import BigTFUNetConfig
from tokeye.models.big_tf_unet.model_big_tf_unet import BigTFUNetModel
from tokeye.transforms import compute_stft as tokeye_stft

from toktagger.api.core.annotators import coords_to_flat_list, mask_to_polygons
from toktagger.api.models.base import Model, ModelRegistry
from toktagger.api.schemas.annotations import Annotation, AnnotationBase, Polygon
from toktagger.api.schemas.data import (
    DataParams,
    DataParamTypes,
    MultiProfile2DData,
    MultiVariateTimeSeriesData,
    Profile2DData,
    TimeSeriesData,
)
from toktagger.api.schemas.samples import Sample

TOKEYE_CHANNELS: tuple[str, ...] = ("coherent", "transient")
TokEyeChannel = typing.Literal["coherent", "transient"]
WEIGHTS_FILENAME = "weights.model"


class TokEyePredictParams(pydantic.BaseModel):
    signal_name: str = pydantic.Field(
        description="Name of the time-series or 2D profile signal to segment."
    )
    channels: list[TokEyeChannel] = pydantic.Field(
        default=["coherent", "transient"],
        min_length=1,
        description="TokEye output channels to convert into polygon annotations.",
    )
    threshold: float = pydantic.Field(
        default=0.5,
        gt=0,
        lt=1,
        description="Pixels with a score above this threshold are part of a region.",
    )
    min_size: int = pydantic.Field(
        default=50, ge=0, description="Remove regions with fewer pixels than this."
    )
    max_polygon_points: int | None = pydantic.Field(
        default=100, gt=2, description="Maximum number of points in each polygon."
    )
    n_fft: int = pydantic.Field(
        default=1024, gt=0, description="STFT window length for time-series signals."
    )
    hop: int = pydantic.Field(
        default=128, gt=0, description="STFT hop length for time-series signals."
    )
    log_scale: bool = pydantic.Field(
        default=True,
        description="Apply log1p to 2D profile values. TokEye expects log-scaled spectrograms.",
    )
    device: typing.Literal["cpu", "cuda", "mps"] = "cpu"


def signal_to_spectrogram(
    signal: TimeSeriesData | Profile2DData, params: TokEyePredictParams
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return a (dim_1, time) spectrogram for TokEye with its time and dim_1 (kHz) axes."""
    if isinstance(signal, TimeSeriesData):
        time = np.asarray(signal.time, dtype=np.float64)
        if len(time) < 2:
            raise ValueError("At least two time samples are required for an STFT.")
        time_step = float(np.abs(np.median(np.diff(time))))
        if time_step == 0:
            raise ValueError("The median time step between samples is zero.")
        sample_rate = 1 / time_step
        spectrogram = tokeye_stft(
            np.asarray(signal.values, dtype=np.float64),
            n_fft=params.n_fft,
            hop=params.hop,
            fs=sample_rate,
        )
        frames = time[0] + np.arange(spectrogram.shape[1]) * params.hop / sample_rate
        # TokEye drops the DC row, so the first row is frequency bin 1.
        freqs = np.arange(1, spectrogram.shape[0] + 1) * sample_rate / params.n_fft
        return spectrogram, frames, freqs / 1000

    values = np.nan_to_num(np.asarray(signal.values, dtype=np.float64)).T
    if params.log_scale:
        values = np.log1p(values.clip(0))
    return values, np.asarray(signal.time), np.asarray(signal.dim_1)


@ModelRegistry.register(
    "tokeye", ["profile-2d"], prediction_params=TokEyePredictParams, pretrained=True
)
class TokEyeSegmentation(Model):
    """Pretrained TokEye U-Net that segments coherent and transient activity in spectrograms."""

    def define_model(self) -> BigTFUNetModel:
        return BigTFUNetModel(BigTFUNetConfig())

    def train(
        self,
        samples: list[Sample],
        annotations: list[list[Annotation]],
        params: pydantic.BaseModel | None = None,
    ) -> float:
        """Download the pretrained TokEye weights. TokEye does not support training in TokTagger."""
        self.log_progress(status="training", progress=0)
        weights_path = download_model("big_tf_unet")
        self.model.load_state_dict(
            torch.load(weights_path, map_location="cpu", weights_only=True)
        )
        self.log_progress(status="completed", progress=100)
        return 0.0

    def predict(
        self,
        samples: list[Sample],
        params: pydantic.BaseModel | None = None,
        data_params: DataParamTypes | None = None,
    ) -> list[list[AnnotationBase]]:
        if not isinstance(params, TokEyePredictParams):
            raise TypeError("TokEye predictions require TokEyePredictParams.")

        self.model.eval()
        predictions: list[list[AnnotationBase]] = []
        for sample in samples:
            sample_data = self.data_loader.get_sample(sample, DataParams())
            signal = (
                sample_data.values.get(params.signal_name)
                if isinstance(
                    sample_data, MultiProfile2DData | MultiVariateTimeSeriesData
                )
                else None
            )
            if not isinstance(signal, TimeSeriesData | Profile2DData):
                raise TypeError(
                    f"Signal '{params.signal_name}' is missing or is not a time-series or 2D profile."
                )

            spectrogram, time, dim_1 = signal_to_spectrogram(signal, params)
            scores = infer(self.model, spectrogram, device=params.device)

            sample_predictions: list[AnnotationBase] = []
            for channel in params.channels:
                channel_scores = scores[TOKEYE_CHANNELS.index(channel)]
                region_polygons = mask_to_polygons(
                    channel_scores > params.threshold,
                    time=time,
                    dim_1=dim_1,
                    min_size=params.min_size,
                    max_polygon_points=params.max_polygon_points,
                )
                sample_predictions.extend(
                    Polygon(
                        segmentation=[coords_to_flat_list(polygon.exterior.coords)],
                        label=channel,
                        created_by=f"model::{self.type}",
                        signal_name=params.signal_name,
                        validated=False,
                        uncertainty=1 - float(channel_scores[region_mask].mean()),
                    )
                    for region_mask, polygon in region_polygons
                )
            predictions.append(sample_predictions)
        return predictions

    def save(self, results_dir: pathlib.Path) -> None:
        torch.save(self.model.state_dict(), results_dir / WEIGHTS_FILENAME)

    def load(
        self, results_dir: pathlib.Path, weights_filename: str | None = None
    ) -> None:
        weights_path = results_dir / (weights_filename or WEIGHTS_FILENAME)
        self.model.load_state_dict(
            torch.load(weights_path, map_location="cpu", weights_only=True)
        )
