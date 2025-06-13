from enum import Enum
from abc import ABC, abstractmethod
from scipy.signal import find_peaks
from scipy.ndimage import uniform_filter1d

import numpy as np
from services.api.schemas.data import MultiVariateTimeSeriesData
from services.api.schemas.annotators import FindPeaksParams
from services.api.schemas.annotations import TimeRegion


class AnnotatorType(str, Enum):  # noqa: F821
    CLASSIC = "classic"
    UNET = "unet"


class DataAnnotator(ABC):
    @abstractmethod
    def predict():
        pass


class FindPeaksAnnotator:
    def __init__(self, params: FindPeaksParams):
        self.params = params

    def predict(self, data: MultiVariateTimeSeriesData) -> list[TimeRegion]:
        time = data.time
        signal = data.values["dalpha"]
        signal = np.array(signal)

        trend = uniform_filter1d(signal, 1000)
        dalpha_detrend = signal - trend

        peak_idx, params = find_peaks(
            dalpha_detrend,
            prominence=self.params.prominence,
            width=[1, 150],
            distance=self.params.distance,
        )

        dt = np.abs(time[1] - time[0])
        regions = []
        for w, idx in zip(params["widths"], peak_idx):
            width = w * 3 * dt
            t = time[idx]
            region = TimeRegion(
                label="ELM", time_min=float(t - width), time_max=float(t + width)
            )
            regions.append(region)

        return regions
