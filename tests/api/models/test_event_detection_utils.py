import numpy as np
import pytest
from unittest.mock import MagicMock

from toktagger.api.models.event_detection_utils import (
    MissingSignalError,
    SignalAlignmentError,
    compute_window_size,
    extract_segment,
    load_aligned_signals,
    load_sample_signals,
    merge_detections,
    select_training_label,
    zscore,
)
from toktagger.api.schemas.data import (
    ImageData,
    MultiVariateTimeSeriesData,
    TimeSeriesData,
)


def _make_ann(time_min, time_max, label=None):
    ann = MagicMock()
    ann.time_min = time_min
    ann.time_max = time_max
    if label is not None:
        ann.label = label
    return ann


def test_zscore_mean_near_zero():
    arr = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
    result = zscore(arr)
    assert abs(result.mean()) < 1e-6


def test_zscore_std_near_one():
    arr = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
    result = zscore(arr)
    assert abs(result.std() - 1.0) < 0.1


def test_zscore_constant_signal_no_divide_by_zero():
    arr = np.ones(10)
    result = zscore(arr)
    assert np.all(np.isfinite(result))


def test_compute_window_size_single_annotation():
    t = np.arange(100, dtype=float)
    ann = _make_ann(10.0, 20.0)
    window = compute_window_size([(ann, t)])
    assert window == 10


def test_compute_window_size_median_of_two_durations():
    t = np.arange(100, dtype=float)
    anns = [_make_ann(0.0, 10.0), _make_ann(0.0, 30.0)]
    window = compute_window_size([(a, t) for a in anns])
    assert window == 20  # median of 10 and 30


def test_compute_window_size_non_time_region_skipped():
    t = np.arange(100, dtype=float)
    non_region = MagicMock(spec=[])  # no time_min/time_max
    ann = _make_ann(5.0, 15.0)
    window = compute_window_size([(non_region, t), (ann, t)])
    assert window == 10


def test_compute_window_size_no_valid_annotations_raises():
    t = np.arange(100, dtype=float)
    non_region = MagicMock(spec=[])
    with pytest.raises(ValueError, match="No valid TimeRegion"):
        compute_window_size([(non_region, t)])


def test_compute_window_size_ignores_other_labels():
    t = np.arange(100, dtype=float)
    pairs = [
        (_make_ann(0.0, 10.0, label="elm"), t),
        (_make_ann(0.0, 14.0, label="elm"), t),
        (_make_ann(0.0, 80.0, label="h_mode"), t),
    ]
    assert compute_window_size(pairs, "elm") == 12
    assert compute_window_size(pairs) == 14


def test_compute_window_size_unmatched_label_raises():
    t = np.arange(100, dtype=float)
    pairs = [(_make_ann(0.0, 10.0, label="h_mode"), t)]
    with pytest.raises(ValueError, match="label 'elm'"):
        compute_window_size(pairs, "elm")


def test_extract_segment_returns_correct_length():
    t = np.arange(100, dtype=float)
    v = np.sin(t / 10)
    seg = extract_segment(t, v, 20.0, 30.0, target_length=20)
    assert seg is not None
    assert len(seg) == 20


def test_extract_segment_output_is_zscored():
    t = np.arange(100, dtype=float)
    v = np.linspace(0, 100, 100)
    seg = extract_segment(t, v, 10.0, 40.0, target_length=15)
    assert seg is not None
    assert abs(seg.mean()) < 0.1


def test_extract_segment_outside_range_returns_none():
    t = np.arange(10, dtype=float)
    v = np.ones(10)
    seg = extract_segment(t, v, 50.0, 60.0, target_length=5)
    assert seg is None


def test_merge_detections_adjacent_positions_merge_to_one():
    t = np.linspace(0.0, 1.0, 100)
    positions = list(range(10, 20))
    results = merge_detections(positions, 5, t, "event", "dtw_motif")
    assert len(results) == 1
    assert results[0].label == "event"


def test_merge_detections_separated_positions_produce_multiple():
    t = np.linspace(0.0, 1.0, 100)
    positions = list(range(5, 10)) + list(range(80, 85))
    results = merge_detections(positions, 3, t, "event", "dtw_motif")
    assert len(results) == 2


def test_merge_detections_empty_positions_returns_empty():
    t = np.linspace(0.0, 1.0, 100)
    results = merge_detections([], 5, t, "event", "dtw_motif")
    assert results == []


def test_merge_detections_time_min_less_than_time_max():
    t = np.linspace(0.0, 10.0, 1000)
    positions = [100, 101, 102]
    results = merge_detections(positions, 10, t, "label", "stumpy_motif")
    assert len(results) == 1
    assert results[0].time_min < results[0].time_max


def test_merge_detections_created_by_set_to_model_type():
    t = np.linspace(0.0, 1.0, 50)
    results = merge_detections([10], 5, t, "ev", "minirocket")
    assert results[0].created_by == "minirocket"
    assert results[0].validated is False


def test_select_training_label_returns_class_label_when_present():
    t = np.arange(100, dtype=float)
    anns = [_make_ann(0.0, 10.0, label="ELM")]
    sample_data = [(t, t, anns)]
    assert select_training_label(sample_data, "ELM") == "ELM"


def test_select_training_label_raises_when_no_matching_annotation():
    t = np.arange(100, dtype=float)
    anns = [_make_ann(0.0, 10.0, label="ELM")]
    sample_data = [(t, t, anns)]
    with pytest.raises(ValueError, match="does not match any annotation label"):
        select_training_label(sample_data, "L-mode")


def test_merge_detections_overlapping_windows_merge():
    """Positions from overlapping (step < window_size) sliding windows should
    merge into a single region even though they are more than 1 sample apart."""
    t = np.linspace(0.0, 1.0, 200)
    positions = [0, 10, 20, 30]
    results = merge_detections(positions, 100, t, "event", "dtw_motif")
    assert len(results) == 1


def _pair(start, stop, n, slope=1.0):
    t = np.linspace(start, stop, n)
    return t, slope * t


def test_load_aligned_signals_single_channel_returns_1d():
    time_array, values = load_aligned_signals({"Ip": _pair(0.0, 10.0, 100)})
    assert values.ndim == 1
    assert len(time_array) == 100


def test_load_aligned_signals_uses_densest_grid():
    time_array, values = load_aligned_signals(
        {"Ip": _pair(0.0, 10.0, 100), "dalpha": _pair(0.0, 10.0, 1000)}
    )
    assert values.shape == (2, 1000)
    assert np.allclose(time_array, np.linspace(0.0, 10.0, 1000))


def test_load_aligned_signals_keeps_channel_order():
    _, values = load_aligned_signals(
        {
            "Ip": _pair(0.0, 10.0, 100, slope=1.0),
            "dalpha": _pair(0.0, 10.0, 100, slope=-1.0),
        }
    )
    assert values[0][-1] > 0
    assert values[1][-1] < 0


def test_load_aligned_signals_crops_to_shared_range():
    time_array, values = load_aligned_signals(
        {"Ip": _pair(0.0, 10.0, 1000), "dalpha": _pair(2.0, 8.0, 100)}
    )
    assert time_array[0] >= 2.0
    assert time_array[-1] <= 8.0
    assert values.shape[1] == len(time_array)


def test_load_aligned_signals_does_not_extrapolate_edges():
    """A shorter channel must never be padded with its repeated end values."""
    time_array, values = load_aligned_signals(
        {"Ip": _pair(0.0, 10.0, 1000), "dalpha": _pair(2.0, 8.0, 100, slope=2.0)}
    )
    assert np.allclose(values[1], 2.0 * time_array, atol=1e-6)
    assert values[1].min() >= 4.0 - 1e-6
    assert values[1].max() <= 16.0 + 1e-6


def test_load_aligned_signals_identical_grids_keep_exact_values():
    t = np.linspace(0.0, 1.0, 50)
    v = np.sin(t)
    _, values = load_aligned_signals({"Ip": (t, v), "dalpha": (t, v)})
    assert np.array_equal(values[0], v)
    assert np.array_equal(values[1], v)


def test_load_aligned_signals_no_overlap_raises():
    with pytest.raises(SignalAlignmentError, match="no common time range"):
        load_aligned_signals(
            {"Ip": _pair(0.0, 5.0, 100), "dalpha": _pair(6.0, 10.0, 100)}
        )


def test_load_aligned_signals_touching_ranges_raise():
    with pytest.raises(SignalAlignmentError, match="no common time range"):
        load_aligned_signals(
            {"Ip": _pair(0.0, 5.0, 100), "dalpha": _pair(5.0, 10.0, 100)}
        )


def test_load_aligned_signals_too_few_shared_samples_raises():
    with pytest.raises(SignalAlignmentError, match="overlap only between"):
        load_aligned_signals(
            {
                "Ip": (np.array([0.0, 1.0, 2.0]), np.array([1.0, 2.0, 3.0])),
                "dalpha": (np.array([1.5, 3.0]), np.array([1.0, 2.0])),
            }
        )


def test_load_aligned_signals_mismatched_lengths_raise():
    with pytest.raises(SignalAlignmentError, match="time points but"):
        load_aligned_signals({"Ip": (np.arange(10.0), np.arange(9.0))})


def test_load_aligned_signals_single_sample_raises():
    with pytest.raises(SignalAlignmentError, match="at least 2"):
        load_aligned_signals({"Ip": (np.array([0.0]), np.array([1.0]))})


def test_load_aligned_signals_non_finite_time_raises():
    time_array = np.array([0.0, 1.0, np.nan, 3.0])
    with pytest.raises(SignalAlignmentError, match="not finite"):
        load_aligned_signals({"Ip": (time_array, np.arange(4.0))})


def test_load_aligned_signals_unsorted_time_raises():
    time_array = np.array([0.0, 2.0, 1.0, 3.0])
    with pytest.raises(SignalAlignmentError, match="do not increase"):
        load_aligned_signals({"Ip": (time_array, np.arange(4.0))})


def test_load_aligned_signals_duplicate_time_points_raise():
    time_array = np.array([0.0, 1.0, 1.0, 2.0])
    with pytest.raises(SignalAlignmentError, match="do not increase"):
        load_aligned_signals({"Ip": (time_array, np.arange(4.0))})


def test_load_aligned_signals_no_signals_raises():
    with pytest.raises(MissingSignalError, match="No signals"):
        load_aligned_signals({})


def _mv_data(**signals):
    return MultiVariateTimeSeriesData(
        values={
            name: None
            if pair is None
            else TimeSeriesData(time=list(pair[0]), values=list(pair[1]))
            for name, pair in signals.items()
        }
    )


def test_load_sample_signals_returns_aligned_channels():
    data = _mv_data(Ip=_pair(0.0, 10.0, 200), dalpha=_pair(0.0, 10.0, 100))
    time_array, values = load_sample_signals(data, ["Ip", "dalpha"], "sample_1")
    assert values.shape == (2, 200)
    assert len(time_array) == 200


def test_load_sample_signals_missing_signal_raises():
    data = _mv_data(Ip=_pair(0.0, 10.0, 200), dalpha=None)
    with pytest.raises(MissingSignalError, match="sample_1"):
        load_sample_signals(data, ["Ip", "dalpha"], "sample_1")


def test_load_sample_signals_unknown_signal_raises():
    data = _mv_data(Ip=_pair(0.0, 10.0, 200))
    with pytest.raises(MissingSignalError, match=r"\['dalpha'\]"):
        load_sample_signals(data, ["Ip", "dalpha"], "sample_1")


def test_load_sample_signals_wrong_data_type_raises():
    data = ImageData(frame=0, values="")
    with pytest.raises(MissingSignalError, match="ImageData"):
        load_sample_signals(data, ["Ip"], "sample_1")
