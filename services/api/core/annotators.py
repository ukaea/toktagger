import numpy as np
import ruptures as rpt
from abc import ABC, abstractmethod
from scipy.signal import find_peaks
from scipy.ndimage import uniform_filter1d, median_filter
from scipy.interpolate import interp1d

from sklearn.preprocessing import StandardScaler
from services.api.schemas.data import MultiVariateTimeSeriesData
from services.api.schemas.annotators import (
    ChangePointDetectionParams,
    FindPeaksParams,
    IsoforestOutliersParams,
    JumpDetectionParams,
    MeanAbsoluteDeviationOutliersParams,
)
from services.api.schemas.annotations import TimeRegion
from services.api.schemas.projects import Task
from services.api.schemas.annotators import AnnotatorIds


def binary_runs_to_tuples(arr):
    """Convert a binary array to a list of tuples representing the start and end indices of runs of True values"""
    arr = np.asarray(arr, dtype=bool)
    padded = np.pad(arr.astype(int), (1, 1), mode="constant")
    diff = np.diff(padded)
    starts = np.where(diff == 1)[0]
    ends = np.where(diff == -1)[0]
    if ends[-1] == len(arr):
        ends[-1] = ends[-1] - 1
    return list(zip(starts, ends))


def downsample_time_series(time, signal, num_points=500):
    """Downsample a time series to a specified number of points."""
    if len(time) <= num_points:
        return time, signal

    time_coarse = np.linspace(time.min(), time.max(), num_points)
    interpolator = interp1d(time, signal, kind="linear")
    signal = interpolator(time_coarse)
    time = time_coarse
    return time, signal


class DataAnnotator(ABC):
    @abstractmethod
    def predict():
        pass


class FindPeaksAnnotator(DataAnnotator):
    def __init__(self, params: FindPeaksParams):
        self.params = params

    def predict(self, data: MultiVariateTimeSeriesData) -> list[TimeRegion]:
        time = data.values[self.params.signal_name].time
        time = np.array(time)
        signal = data.values[self.params.signal_name].values
        signal = np.array(signal)

        signal = signal.reshape(-1, 1)
        scaler = StandardScaler()
        signal = scaler.fit_transform(signal)
        signal = signal.flatten()

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
                    label="Peak",
                    time_min=float(peak_time - width),
                    time_max=float(peak_time + width),
                )
                regions.append(region)

        return regions


class MeanAbsoluteDeviationOutliersAnnotator(DataAnnotator):
    def __init__(self, params: MeanAbsoluteDeviationOutliersParams):
        self.params = params

    def predict(self, data: MultiVariateTimeSeriesData) -> list[TimeRegion]:
        time = data.values[self.params.signal_name].time
        time = np.array(time)
        data = data.values[self.params.signal_name].values
        data = np.array(data)

        median = np.median(data)
        abs_deviation = np.abs(data - median)
        mad = np.median(abs_deviation)

        if mad == 0:
            # Prevent division by zero; fallback to simple thresholding
            return np.zeros_like(data, dtype=bool)

        modified_z_scores = 0.6745 * (data - median) / mad
        outliers = np.abs(modified_z_scores) > self.params.threshold

        bounds = binary_runs_to_tuples(outliers)
        bounds = [
            TimeRegion(time_min=time[imin], time_max=time[imax], label="Outlier")
            for imin, imax in bounds
        ]
        return bounds


class IsoforestOutliersAnnotator(DataAnnotator):
    def __init__(self, params: IsoforestOutliersParams):
        self.params = params

    def predict(self, data: MultiVariateTimeSeriesData) -> list[TimeRegion]:
        from sklearn.ensemble import IsolationForest

        time = data.values[self.params.signal_name].time
        time = np.array(time)
        values = data.values[self.params.signal_name].values
        values = np.array(values)
        values = values.reshape(-1, 1)

        scaler = StandardScaler()
        np_scaled = scaler.fit_transform(values)

        model = IsolationForest(contamination=self.params.contamination)
        model.fit(np_scaled)

        outliers = model.predict(np_scaled) == -1
        bounds = binary_runs_to_tuples(outliers)
        bounds = [
            TimeRegion(time_min=time[imin], time_max=time[imax], label="Outlier")
            for imin, imax in bounds
        ]
        return bounds


class ChangePointDetectionAnnotator(DataAnnotator):
    def __init__(self, params: ChangePointDetectionParams):
        self.params = params

    def predict(self, data: MultiVariateTimeSeriesData) -> list[TimeRegion]:
        time = data.values[self.params.signal_name].time
        time = np.array(time)

        signal = data.values[self.params.signal_name].values
        signal = np.array(signal)

        # Downsample the time series to for performance
        time, signal = downsample_time_series(time, signal, num_points=500)

        time = time.reshape(-1, 1)
        signal = signal.reshape(-1, 1)

        scaler = StandardScaler()
        signal = scaler.fit_transform(signal)

        intercept = np.ones(len(time))

        inputs = np.column_stack((signal, time, intercept))

        algo = rpt.Pelt(model="linear")
        algo.fit(inputs)
        result = algo.predict(pen=self.params.penalty)

        result = np.concatenate([[0], result])
        result[-1] -= 1

        time = time.flatten()
        bounds = [
            TimeRegion(time_min=time[imin], time_max=time[imax], label="Change Point")
            for imin, imax in zip(result, result[1:])
        ]
        return bounds


class JumpDetectionAnnotator(DataAnnotator):
    def __init__(self, params: JumpDetectionParams):
        self.params = params

    def predict(self, data: MultiVariateTimeSeriesData) -> list[TimeRegion]:
        time = data.values[self.params.signal_name].time
        time = np.array(time)

        signal = data.values[self.params.signal_name].values
        signal = np.array(signal)

        # Downsample the time series to for performance
        time, signal = downsample_time_series(time, signal, num_points=2000)

        signal = signal.reshape(-1, 1)

        scaler = StandardScaler()
        signal = scaler.fit_transform(signal)
        signal = signal.flatten()

        # Smooth the signal to reduce noise
        signal -= median_filter(signal, 100)
        signal = median_filter(signal, 10)
        signal = np.absolute(np.gradient(signal))

        # Detect sharp drops (e.g., drops > 3 * std of normal fluctuations)
        threshold = self.params.threshold * signal.std()
        peak_idx = np.where(signal > threshold)[0]

        # Filter detections which are too close
        peak_idx = peak_idx[np.diff(peak_idx, prepend=0) > self.params.min_distance]

        bounds = []
        for i in peak_idx:
            wsize = 10
            window = signal[i - wsize : i + wsize]
            twindow = time[i - wsize : i + wsize]
            tmin = twindow[np.argmin(window)]
            tmax = twindow[np.argmax(window)]
            bounds.append(TimeRegion(time_min=tmin, time_max=tmax, label="Jump"))

        return bounds


ANNOTATORS = {
    AnnotatorIds.FIND_PEAKS: FindPeaksAnnotator,
    AnnotatorIds.MEAN_ABSOLUTE_DEVIATION: MeanAbsoluteDeviationOutliersAnnotator,
    AnnotatorIds.ISOFOREST_OUTLIERS: IsoforestOutliersAnnotator,
    AnnotatorIds.CHANGE_POINT_DETECTION: ChangePointDetectionAnnotator,
    AnnotatorIds.JUMP_DETECTION: JumpDetectionAnnotator,
}
# Currently only allowing these annotators to task mapping
# Might want user to be able to specify a choice when making the project down the line?
ANNOTATORS_PER_TASK = {
    Task.ELM: [
        AnnotatorIds.FIND_PEAKS,
        AnnotatorIds.MEAN_ABSOLUTE_DEVIATION,
        AnnotatorIds.ISOFOREST_OUTLIERS,
        AnnotatorIds.CHANGE_POINT_DETECTION,
        AnnotatorIds.JUMP_DETECTION,
    ],
    Task.DISRUPTION: [
        AnnotatorIds.FIND_PEAKS,
        AnnotatorIds.MEAN_ABSOLUTE_DEVIATION,
        AnnotatorIds.ISOFOREST_OUTLIERS,
        AnnotatorIds.CHANGE_POINT_DETECTION,
        AnnotatorIds.JUMP_DETECTION,
    ],
    Task.MHD: [],
    Task.UFO: [],
}
