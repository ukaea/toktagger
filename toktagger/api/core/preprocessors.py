import numpy as np
from scipy.ndimage import gaussian_filter1d, uniform_filter1d
from sklearn.preprocessing import MinMaxScaler, StandardScaler

from toktagger.api.schemas.data import MultiVariateTimeSeriesData, TimeSeriesData
from toktagger.api.schemas.preprocessing import (
    BackgroundSubtractionStep,
    NormalisationStep,
    PreprocessingConfig,
    PreprocessingStep,
    SmoothingStep,
)


def _apply_smoothing(arr: np.ndarray, step: SmoothingStep) -> np.ndarray:
    if step.method == "gaussian":
        return gaussian_filter1d(arr, sigma=step.sigma)
    return uniform_filter1d(arr, size=max(1, int(step.sigma)))


def _apply_background_subtraction(
    arr: np.ndarray, step: BackgroundSubtractionStep
) -> np.ndarray:
    trend = uniform_filter1d(arr, size=step.window_size, mode="nearest")
    return arr - trend


def _apply_normalisation(arr: np.ndarray, step: NormalisationStep) -> np.ndarray:
    scaler = StandardScaler() if step.method == "zscore" else MinMaxScaler()
    return scaler.fit_transform(arr.reshape(-1, 1)).flatten()


def _apply_step(arr: np.ndarray, step: PreprocessingStep) -> np.ndarray:
    if isinstance(step, SmoothingStep):
        return _apply_smoothing(arr, step)
    if isinstance(step, BackgroundSubtractionStep):
        return _apply_background_subtraction(arr, step)
    if isinstance(step, NormalisationStep):
        return _apply_normalisation(arr, step)
    raise ValueError(f"Unknown preprocessing step type: {type(step)}")


def apply_preprocessing(
    data: MultiVariateTimeSeriesData,
    config: PreprocessingConfig,
) -> MultiVariateTimeSeriesData:
    if not config.steps:
        return data

    new_values: dict[str, TimeSeriesData | None] = dict(data.values)

    for step in config.steps:
        name = step.signal_name
        if name not in new_values or new_values[name] is None:
            continue
        ts = new_values[name]
        arr = _apply_step(np.array(ts.values), step)
        new_values[name] = TimeSeriesData(time=ts.time, values=arr.tolist())

    return MultiVariateTimeSeriesData(values=new_values)
