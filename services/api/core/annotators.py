from enum import Enum
from abc import ABC, abstractmethod
from scipy.signal import find_peaks
from scipy.ndimage import uniform_filter1d

import numpy as np
from services.api.schemas.data import MultiVariateTimeSeriesData
from services.api.schemas.annotators import FindPeaksParams
from services.api.schemas.annotations import TimeRegion
from services.api.schemas.projects import Task
from services.api.schemas.annotators import AnnotatorTypes

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

ANNOTATORS = {
    AnnotatorTypes.FIND_PEAKS: FindPeaksAnnotator,
}
# Currently only allowing these annotators to task mapping
# Might want user to be able to specify a choice when making the project down the line?
ANNOTATORS_PER_TASK = {
    Task.ELM: [AnnotatorTypes.FIND_PEAKS,],
    Task.DISRUPTION: [],
    Task.MHD: [],
    Task.UFO: []
}