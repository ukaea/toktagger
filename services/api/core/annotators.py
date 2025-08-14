from enum import Enum
from abc import ABC, abstractmethod
from scipy.signal import find_peaks, stft
from scipy.ndimage import uniform_filter1d
import numpy as np

from services.api.schemas.data import MultiVariateTimeSeriesData
from services.api.schemas.annotators import FindPeaksParams, ThresholdParams
from services.api.schemas.annotations import TimeRegion, SpectrogramMask
from services.api.schemas.projects import Task
from services.api.schemas.annotators import AnnotatorIds


class DataAnnotator(ABC):
    @abstractmethod
    def predict():
        pass


class FindPeaksAnnotator:
    def __init__(self, params: FindPeaksParams):
        self.params = params

    def predict(self, data: MultiVariateTimeSeriesData) -> list[TimeRegion]:
        time = np.array(data.values[self.params.signal_name].time)
        signal = data.values[self.params.signal_name].values
        signal = np.array(signal)

        tmin, tmax = self.params.time_min, self.params.time_max
        tmin = time.min() if tmin is None else tmin
        tmax = time.max() if tmax is None else tmax

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
            peak_time = time[idx]
            if peak_time >= tmin and peak_time <= tmax:
                region = TimeRegion(
                    label="ELM",
                    time_min=float(peak_time - width),
                    time_max=float(peak_time + width),
                )
                regions.append(region)

        return regions


class ThresholdAnnotator:
    def __init__(self, params: ThresholdParams):
        self.params = params

    def predict(self, data: MultiVariateTimeSeriesData) -> SpectrogramMask:
        time = np.array(data.values["mirnov"].time)
        values = np.array(data.values["mirnov"].values)

        sample_rate = 1 / (time[1] - time[0])

        _, _, values = stft(
            values,
            fs=int(sample_rate),
            nperseg=256,
            noverlap=128,
        )

        values = np.absolute(values)
        threshold_value = np.percentile(values, self.params.percentile)
        threshold_mask = values > threshold_value
        return [
            SpectrogramMask(label="SpectrogramMask", values=threshold_mask.tolist())
        ]


ANNOTATORS = {
    AnnotatorIds.FIND_PEAKS: FindPeaksAnnotator,
    AnnotatorIds.THRESHOLD: ThresholdAnnotator,
}
# Currently only allowing these annotators to task mapping
# Might want user to be able to specify a choice when making the project down the line?
ANNOTATORS_PER_TASK = {
    Task.ELM: [
        AnnotatorIds.FIND_PEAKS,
    ],
    Task.DISRUPTION: [],
    Task.MHD: [AnnotatorIds.THRESHOLD],
    Task.UFO: [],
}
