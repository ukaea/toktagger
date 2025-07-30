import numpy as np
import ruptures as rpt
import hmmlearn.hmm as hmm
from abc import ABC, abstractmethod
from scipy.signal import find_peaks
from scipy.ndimage import uniform_filter1d, gaussian_filter
from scipy.interpolate import interp1d

from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from services.api.schemas.data import MultiVariateTimeSeriesData
from services.api.schemas.annotators import (
    ChangePointDetectionParams,
    PeakDetectionParams,
    JumpDetectionParams,
    OutlierDetectionParams,
)
from services.api.schemas.annotations import TimeRegion
from services.api.schemas.projects import Task
from services.api.schemas.annotators import AnnotatorIds


def binary_runs_to_tuples(arr: np.ndarray) -> list[tuple[int, int]]:
    """
    Convert a 1D binary array into a list of (start, end) index tuples for each contiguous run of 1s.

    Parameters:
        arr (np.ndarray): A 1D numpy array of binary values (0s and 1s).

    Returns:
        list[tuple[int, int]]: A list of tuples, where each tuple (start, end) represents the start (inclusive)
        and end (exclusive) indices of a contiguous run of 1s in the input array.

    Example:
        >>> binary_runs_to_tuples(np.array([0, 1, 1, 0, 1, 0, 0, 1, 1, 1]))
        [(1, 3), (4, 5), (7, 10)]
    """
    arr = np.asarray(arr, dtype=bool)
    padded = np.pad(arr.astype(int), (1, 1), mode="constant")
    diff = np.diff(padded)
    starts = np.where(diff == 1)[0]
    ends = np.where(diff == -1)[0]
    if ends[-1] == len(arr):
        ends[-1] = ends[-1] - 1
    return list(zip(starts, ends))


def extract_segments(arr: np.ndarray) -> list[tuple[int, int, int]]:
    """
    Convert a 1D array into a list of (start_index, end_index, label) tuples
    representing contiguous segments of the same labels.

    Parameters:
        arr (np.ndarray or list): Input 1D array or list of labels.

    Returns:
        List[Tuple[int, int, int]]: List of (start, end, label) for each segment.
    """
    arr = np.asarray(arr)
    if arr.ndim != 1:
        raise ValueError("Input must be a 1D array or list.")

    change_indices = np.where(np.diff(arr) != 0)[0] + 1
    segment_starts = np.concatenate(([0], change_indices))
    segment_ends = np.concatenate((change_indices, [len(arr) - 1]))

    return [
        (start, end, arr[start]) for start, end in zip(segment_starts, segment_ends)
    ]


def downsample_time_series(
    time: np.ndarray, signal: np.ndarray, num_points=500
) -> tuple[np.ndarray, np.ndarray]:
    """
    Downsample a time series to a specified number of points using linear interpolation.

    Parameters:
        time (np.ndarray): 1D array of time values.
        signal (np.ndarray): 1D array of signal values corresponding to the time array.
        num_points (int, optional): Number of points to downsample to. Default is 500.

    Returns:
        tuple[np.ndarray, np.ndarray]: Tuple containing the downsampled time and signal arrays.
    """
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


class PeakDetectionAnnotator(DataAnnotator):
    """
    Annotator class for detecting peaks in a multivariate time series signal.

    This class uses signal normalization, detrending, and peak finding algorithms to identify
    regions in the specified signal where peaks occur, based on configurable parameters.

    Attributes:
        params (FindPeaksParams): Configuration parameters for peak detection, including
            signal name, prominence, distance, and optional time bounds.

    Methods:
        predict(data: MultiVariateTimeSeriesData) -> list[TimeRegion]:
            Detects peaks in the specified signal of the input time series data and returns
            a list of TimeRegion objects corresponding to the detected peaks.
    """

    def __init__(self, params: PeakDetectionParams):
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
            width = w * 1 * dt
            peak_time = time[idx]
            if peak_time >= tmin and peak_time <= tmax:
                region = TimeRegion(
                    label="Peak",
                    time_min=float(peak_time - width),
                    time_max=float(peak_time + width),
                    created_by=AnnotatorIds.PEAK_DETECTION,
                )
                regions.append(region)

        return regions


class OutlierDetectionAnnotator(DataAnnotator):
    def __init__(self, params: OutlierDetectionParams):
        self.params = params

    def predict(self, data: MultiVariateTimeSeriesData) -> list[TimeRegion]:
        time = data.values[self.params.signal_name].time
        time = np.array(time)
        values = data.values[self.params.signal_name].values
        values = np.array(values)

        if self.params.method == "mad":
            bounds = self.mad_outliers(time, values)
        elif self.params.method == "isoforest":
            bounds = self.isoforest_outliers(time, values)
        else:
            raise ValueError(f"Unknown outlier detection method: {self.params.method}")

        return bounds

    def isoforest_outliers(
        self, time: np.ndarray, values: np.ndarray
    ) -> list[TimeRegion]:
        values = values.reshape(-1, 1)

        if self.params.contamination is None or self.params.contamination <= 0:
            return []

        scaler = StandardScaler()
        np_scaled = scaler.fit_transform(values)

        model = IsolationForest(contamination=self.params.contamination)
        model.fit(np_scaled)

        outliers = model.predict(np_scaled) == -1
        bounds = binary_runs_to_tuples(outliers)
        bounds = [
            TimeRegion(
                time_min=time[imin],
                time_max=time[imax],
                label="Outlier",
                created_by=AnnotatorIds.OUTLIER_DETECTION,
            )
            for imin, imax in bounds
        ]
        return bounds

    def mad_outliers(self, time: np.ndarray, data: np.ndarray) -> list[TimeRegion]:
        median = np.median(data)
        abs_deviation = np.abs(data - median)
        mad = np.median(abs_deviation)

        if mad == 0:
            return []

        modified_z_scores = 0.6745 * (data - median) / mad
        outliers = np.abs(modified_z_scores) > self.params.threshold

        if not np.any(outliers):
            return []

        bounds = binary_runs_to_tuples(outliers)
        bounds = [
            TimeRegion(
                time_min=time[imin],
                time_max=time[imax],
                label="Outlier",
                created_by=AnnotatorIds.OUTLIER_DETECTION,
            )
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
        signal = np.nan_to_num(signal, 0)

        # Downsample the time series to for performance
        time, signal = downsample_time_series(
            time, signal, num_points=self.params.num_points
        )

        if self.params.method == "pelt":
            bounds = self.pelt_changepoint(signal, time)
        elif self.params.method == "hmm":
            bounds = self.hmm_changepoint(signal, time)
        else:
            raise ValueError(
                f"Unknown change point detection method: {self.params.method}"
            )

        return bounds

    def pelt_changepoint(self, signal, time):
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
            TimeRegion(
                time_min=time[imin],
                time_max=time[imax],
                label="Change Point",
                created_by=AnnotatorIds.CHANGE_POINT_DETECTION,
            )
            for imin, imax in zip(result, result[1:])
        ]
        return bounds

    def hmm_changepoint(self, signal, time):
        time = time.reshape(-1, 1)
        signal = signal.reshape(-1, 1)

        scaler = StandardScaler()
        signal = scaler.fit_transform(signal)

        model = hmm.GaussianHMM(
            n_components=self.params.num_components, covariance_type="full", n_iter=100
        )
        model.fit(signal)
        hidden_states = model.predict(signal)
        time = time.flatten()
        bounds = extract_segments(hidden_states + 1)
        bounds = [(time[imin], time[imax]) for (imin, imax, _) in bounds]
        bounds = [
            TimeRegion(
                time_min=tmin,
                time_max=tmax,
                label="Change Point",
                created_by=AnnotatorIds.CHANGE_POINT_DETECTION,
            )
            for (tmin, tmax) in bounds
        ]
        return bounds


class JumpDetectionAnnotator(DataAnnotator):
    """
    Annotator for detecting sharp jumps in a multivariate time series signal.

    This annotator processes a specified signal from the input time series data,
    applies smoothing and normalization, and identifies regions where the signal
    exhibits sharp changes (jumps) based on the gradient exceeding a threshold.
    Detected jumps are returned as time regions.

    Attributes:
        params (JumpDetectionParams): Parameters controlling the detection process,
            including signal name, smoothing factor, number of downsample points,
            detection threshold, and minimum distance between detections.

    Methods:
        predict(data: MultiVariateTimeSeriesData) -> list[TimeRegion]:
            Detects and returns a list of time regions where jumps are detected
            in the specified signal.
    """

    def __init__(self, params: JumpDetectionParams):
        self.params = params

    def predict(self, data: MultiVariateTimeSeriesData) -> list[TimeRegion]:
        time = data.values[self.params.signal_name].time
        time = np.array(time)

        signal = data.values[self.params.signal_name].values
        signal = np.array(signal)
        signal = np.nan_to_num(signal, 0)

        # Downsample the time series to for performance
        time, signal = downsample_time_series(
            time, signal, num_points=self.params.num_points
        )

        # Smooth the signal to reduce noise
        signal = gaussian_filter(signal, self.params.smoothing)
        signal_grad = np.absolute(np.gradient(signal))

        signal_grad = signal_grad.reshape(-1, 1)
        scaler = StandardScaler()
        signal_grad = scaler.fit_transform(signal_grad)
        signal_grad = signal_grad.flatten()

        # Detect sharp drops (e.g., drops > 3 * std of normal fluctuations)
        threshold = self.params.threshold * signal_grad.std()
        peak_idx = np.where(signal_grad > threshold)[0]

        # Filter detections which are too close
        peak_idx = peak_idx[np.diff(peak_idx, prepend=0) > self.params.min_distance]

        bounds = []
        for i in peak_idx:
            wsize = 10
            window = signal[i - wsize : i + wsize]
            twindow = time[i - wsize : i + wsize]
            tmin = twindow[0]
            tmax = twindow[-1]
            tmin = twindow[np.argmax(window)]
            tmax = twindow[np.argmin(window)]
            bounds.append(
                TimeRegion(
                    time_min=tmin,
                    time_max=tmax,
                    label="Jump",
                    created_by=AnnotatorIds.JUMP_DETECTION,
                )
            )

        return bounds


ANNOTATORS = {
    AnnotatorIds.PEAK_DETECTION: PeakDetectionAnnotator,
    AnnotatorIds.OUTLIER_DETECTION: OutlierDetectionAnnotator,
    AnnotatorIds.CHANGE_POINT_DETECTION: ChangePointDetectionAnnotator,
    AnnotatorIds.JUMP_DETECTION: JumpDetectionAnnotator,
}
# Currently only allowing these annotators to task mapping
# Might want user to be able to specify a choice when making the project down the line?
ANNOTATORS_PER_TASK = {
    Task.ELM: [
        AnnotatorIds.PEAK_DETECTION,
        AnnotatorIds.OUTLIER_DETECTION,
        AnnotatorIds.CHANGE_POINT_DETECTION,
        AnnotatorIds.JUMP_DETECTION,
    ],
    Task.DISRUPTION: [
        AnnotatorIds.PEAK_DETECTION,
        AnnotatorIds.OUTLIER_DETECTION,
        AnnotatorIds.CHANGE_POINT_DETECTION,
        AnnotatorIds.JUMP_DETECTION,
    ],
    Task.MHD: [],
    Task.UFO: [],
}
