from collections.abc import Sequence

import numpy as np
from scipy.interpolate import interp1d

from toktagger.api.schemas.annotations import TimeRegion
from toktagger.api.schemas.data import DataResponseType, MultiVariateTimeSeriesData


SignalArray = Sequence[float] | np.ndarray


class MissingSignalError(ValueError):
    """A sample does not hold a signal which the model needs."""


class SignalAlignmentError(ValueError):
    """The signals of a sample cannot go onto one common time grid."""


def compute_window_size(ann_time_pairs: list[tuple], class_label: str = "") -> int:
    """Return median annotation duration converted to sample count.

    Parameters
    ----------
    ann_time_pairs : list of (Annotation, np.ndarray) pairs
        Each pair is an annotation and the time array of its parent signal.
    class_label : str
        Use only the annotations which carry this label. Leave blank to use
        every label present, which is correct only when the model also builds
        its templates from every label.
    """
    durations = []
    for ann, time_array in ann_time_pairs:
        if not (hasattr(ann, "time_min") and hasattr(ann, "time_max")):
            continue
        if class_label and ann.label != class_label:
            continue
        if len(time_array) < 2:
            continue
        dt = float(np.median(np.diff(time_array)))
        if dt <= 0:
            continue
        n_samples = int(round((ann.time_max - ann.time_min) / dt))
        if n_samples > 1:
            durations.append(n_samples)

    if not durations:
        if class_label:
            raise ValueError(
                f"No valid TimeRegion annotations with label '{class_label}' "
                "found to infer window size. Ensure the project has TimeRegion "
                "annotations with that label before training."
            )
        raise ValueError(
            "No valid TimeRegion annotations found to infer window size. "
            "Ensure the project has TimeRegion annotations before training."
        )
    return max(2, int(np.median(durations)))


def extract_segment(
    time_array: np.ndarray,
    values: np.ndarray,
    time_min: float,
    time_max: float,
    target_length: int,
) -> np.ndarray | None:
    """Extract a signal segment by time range, resample and z-score normalise.

    Returns None if the segment is too short to resample.
    """
    mask = (time_array >= time_min) & (time_array <= time_max)
    seg_t = time_array[mask]
    seg_v = values[mask]
    if len(seg_v) < 2:
        return None
    interp = interp1d(seg_t, seg_v, bounds_error=False, fill_value="extrapolate")
    new_t = np.linspace(seg_t[0], seg_t[-1], target_length)
    return zscore(interp(new_t))


def zscore(arr: np.ndarray) -> np.ndarray:
    std = np.std(arr)
    return (arr - np.mean(arr)) / (std + 1e-8)


def _validate_signal(
    name: str, time: SignalArray, values: SignalArray
) -> tuple[np.ndarray, np.ndarray]:
    """Return a signal as float arrays, or raise if its data is unusable."""
    time_array = np.asarray(time, dtype=float)
    value_array = np.asarray(values, dtype=float)

    if time_array.ndim != 1 or value_array.ndim != 1:
        raise SignalAlignmentError(
            f"Signal '{name}' must be one dimensional, but its time array has "
            f"shape {time_array.shape} and its value array has shape "
            f"{value_array.shape}."
        )
    if time_array.size != value_array.size:
        raise SignalAlignmentError(
            f"Signal '{name}' has {time_array.size} time points but "
            f"{value_array.size} values."
        )
    if time_array.size < 2:
        raise SignalAlignmentError(
            f"Signal '{name}' has {time_array.size} sample(s), but at least 2 "
            "are necessary."
        )
    if not np.all(np.isfinite(time_array)):
        raise SignalAlignmentError(
            f"Signal '{name}' has time points which are not finite."
        )
    if np.any(np.diff(time_array) <= 0):
        raise SignalAlignmentError(
            f"Signal '{name}' has time points which do not increase."
        )
    return time_array, value_array


def load_aligned_signals(
    signals: dict[str, tuple[SignalArray, SignalArray]],
) -> tuple[np.ndarray, np.ndarray]:
    """Align one or more signals onto a common time grid.

    Parameters
    ----------
    signals : dict of signal name to a (time_array, values) pair, one entry per
        channel. The channels keep the order of the dictionary.

    Returns
    -------
    (time_array, values) where values is 1D if a single channel was given,
    otherwise a 2D array of shape (n_channels, n_samples). Multiple channels
    are cropped to the time range which all of them cover, then linearly
    resampled onto the grid of the densest channel in that range. Thus
    channels recorded at different sampling rates can be combined, and no
    channel is extrapolated past the range it actually records.

    Raises
    ------
    MissingSignalError
        If no signals were given.
    SignalAlignmentError
        If the data of a signal is unusable, or if the signals have no common
        time range.
    """
    if not signals:
        raise MissingSignalError("No signals were given to align.")

    validated = {
        name: _validate_signal(name, time, values)
        for name, (time, values) in signals.items()
    }

    if len(validated) == 1:
        return next(iter(validated.values()))

    time_min = max(time_array[0] for time_array, _ in validated.values())
    time_max = min(time_array[-1] for time_array, _ in validated.values())
    if time_max <= time_min:
        ranges = ", ".join(
            f"'{name}' [{time_array[0]:g}, {time_array[-1]:g}]"
            for name, (time_array, _) in validated.items()
        )
        raise SignalAlignmentError(
            f"Signals have no common time range: {ranges}. Select signals which "
            "overlap in time."
        )

    masks = {
        name: (time_array >= time_min) & (time_array <= time_max)
        for name, (time_array, _) in validated.items()
    }
    reference = max(masks, key=lambda name: int(masks[name].sum()))
    reference_time = validated[reference][0][masks[reference]]
    if reference_time.size < 2:
        raise SignalAlignmentError(
            f"Signals overlap only between {time_min:g} and {time_max:g}, which "
            "holds fewer than 2 samples of each signal."
        )

    aligned = []
    for name, (time_array, value_array) in validated.items():
        if name == reference:
            aligned.append(value_array[masks[name]])
        elif np.array_equal(time_array, reference_time):
            aligned.append(value_array)
        else:
            aligned.append(np.interp(reference_time, time_array, value_array))
    return reference_time, np.array(aligned)


def load_sample_signals(
    data: DataResponseType,
    signal_names: list[str],
    sample_id: str,
) -> tuple[np.ndarray, np.ndarray]:
    """Load the named signals of one sample onto a common time grid.

    Raises
    ------
    MissingSignalError
        If the sample does not hold one of the named signals.
    SignalAlignmentError
        If the signals of the sample cannot be aligned.
    """
    if not isinstance(data, MultiVariateTimeSeriesData):
        raise MissingSignalError(
            f"Sample {sample_id} holds {type(data).__name__}, which has no "
            f"time series signals {signal_names}."
        )

    signals: dict[str, tuple[SignalArray, SignalArray]] = {}
    missing: list[str] = []
    for name in signal_names:
        signal = data.values.get(name)
        if signal is None:
            missing.append(name)
        else:
            signals[name] = (signal.time, signal.values)

    if missing:
        raise MissingSignalError(
            f"Sample {sample_id} does not hold the necessary signal(s) {missing}."
        )
    return load_aligned_signals(signals)


def select_training_label(
    sample_data: list[tuple[np.ndarray, np.ndarray, list]],
    class_label: str,
) -> str:
    """Validate that class_label matches a real annotation label in the data.

    Models using this helper train a single binary classifier (event vs.
    background) against `class_label`. If no annotation in the training data
    actually carries that label, raise a clear error rather than silently
    training on zero positive examples.
    """
    all_labels = {
        ann.label
        for _, _, anns in sample_data
        for ann in anns
        if hasattr(ann, "time_min")
    }
    if class_label not in all_labels:
        raise ValueError(
            f"class_label '{class_label}' does not match any annotation label "
            f"found in the training data. Available labels: {sorted(all_labels)}"
        )
    return class_label


def non_max_suppression(
    detections: list[TimeRegion], iou_threshold: float = 0.5
) -> list[TimeRegion]:
    """Remove overlapping TimeRegion detections with the same label using greedy NMS.

    merge_detections handles consecutive window positions; this handles the case
    where separate position clusters produce time regions that still overlap heavily.
    Detections are sorted by duration (shorter = more precise) before suppression.
    """
    if not detections:
        return []

    by_label: dict[str, list[TimeRegion]] = {}
    for det in detections:
        by_label.setdefault(det.label, []).append(det)

    result: list[TimeRegion] = []
    for group in by_label.values():
        group = sorted(group, key=lambda a: a.time_max - a.time_min)
        kept: list[TimeRegion] = []
        for ann in group:
            for other in kept:
                inter = max(
                    0.0,
                    min(ann.time_max, other.time_max)
                    - max(ann.time_min, other.time_min),
                )
                union = (
                    (ann.time_max - ann.time_min)
                    + (other.time_max - other.time_min)
                    - inter
                )
                if union > 0 and inter / union > iou_threshold:
                    break
            else:
                kept.append(ann)
        result.extend(kept)
    return result


def merge_detections(
    positions: list[int],
    window_size: int,
    time_array: np.ndarray,
    label: str,
    model_type: str,
) -> list[TimeRegion]:
    """Merge adjacent/overlapping window start indices into TimeRegion annotations."""
    if not positions:
        return []

    positions = sorted(positions)
    regions: list[tuple[int, int]] = []
    start = end = positions[0]

    for pos in positions[1:]:
        if pos <= end + window_size:
            end = max(end, pos)
        else:
            regions.append((start, end))
            start = end = pos
    regions.append((start, end))

    anns = []
    n = len(time_array)
    for s, e in regions:
        t_min = float(time_array[s])
        t_max = float(time_array[min(e + window_size - 1, n - 1)])
        if t_max <= t_min:
            t_max = t_min + 1e-6
        anns.append(
            TimeRegion(
                label=label,
                time_min=t_min,
                time_max=t_max,
                created_by=model_type,
                validated=False,
            )
        )
    return anns
