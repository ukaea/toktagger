import numpy as np
import pytest
from unittest.mock import MagicMock

from toktagger.api.models.event_detection_utils import (
    compute_window_size,
    extract_segment,
    merge_detections,
    zscore,
)


def _make_ann(time_min, time_max):
    ann = MagicMock()
    ann.time_min = time_min
    ann.time_max = time_max
    return ann


class TestZscore:
    def test_mean_near_zero(self):
        arr = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        result = zscore(arr)
        assert abs(result.mean()) < 1e-6

    def test_std_near_one(self):
        arr = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        result = zscore(arr)
        assert abs(result.std() - 1.0) < 0.1

    def test_constant_signal_no_divide_by_zero(self):
        arr = np.ones(10)
        result = zscore(arr)
        assert np.all(np.isfinite(result))


class TestComputeWindowSize:
    def test_single_annotation(self):
        t = np.arange(100, dtype=float)
        ann = _make_ann(10.0, 20.0)
        window = compute_window_size([(ann, t)])
        assert window == 10

    def test_median_of_two_durations(self):
        t = np.arange(100, dtype=float)
        anns = [_make_ann(0.0, 10.0), _make_ann(0.0, 30.0)]
        window = compute_window_size([(a, t) for a in anns])
        assert window == 20  # median of 10 and 30

    def test_non_time_region_skipped(self):
        t = np.arange(100, dtype=float)
        non_region = MagicMock(spec=[])  # no time_min/time_max
        ann = _make_ann(5.0, 15.0)
        window = compute_window_size([(non_region, t), (ann, t)])
        assert window == 10

    def test_no_valid_annotations_raises(self):
        t = np.arange(100, dtype=float)
        non_region = MagicMock(spec=[])
        with pytest.raises(ValueError, match="No valid TimeRegion"):
            compute_window_size([(non_region, t)])


class TestExtractSegment:
    def test_returns_correct_length(self):
        t = np.arange(100, dtype=float)
        v = np.sin(t / 10)
        seg = extract_segment(t, v, 20.0, 30.0, target_length=20)
        assert seg is not None
        assert len(seg) == 20

    def test_output_is_zscored(self):
        t = np.arange(100, dtype=float)
        v = np.linspace(0, 100, 100)
        seg = extract_segment(t, v, 10.0, 40.0, target_length=15)
        assert seg is not None
        assert abs(seg.mean()) < 0.1

    def test_segment_outside_range_returns_none(self):
        t = np.arange(10, dtype=float)
        v = np.ones(10)
        seg = extract_segment(t, v, 50.0, 60.0, target_length=5)
        assert seg is None


class TestMergeDetections:
    def test_adjacent_positions_merge_to_one(self):
        t = np.linspace(0.0, 1.0, 100)
        positions = list(range(10, 20))
        results = merge_detections(positions, 5, t, "event", "dtw_motif")
        assert len(results) == 1
        assert results[0].label == "event"

    def test_separated_positions_produce_multiple(self):
        t = np.linspace(0.0, 1.0, 100)
        positions = list(range(5, 10)) + list(range(80, 85))
        results = merge_detections(positions, 3, t, "event", "dtw_motif")
        assert len(results) == 2

    def test_empty_positions_returns_empty(self):
        t = np.linspace(0.0, 1.0, 100)
        results = merge_detections([], 5, t, "event", "dtw_motif")
        assert results == []

    def test_time_min_less_than_time_max(self):
        t = np.linspace(0.0, 10.0, 1000)
        positions = [100, 101, 102]
        results = merge_detections(positions, 10, t, "label", "stumpy_motif")
        assert len(results) == 1
        assert results[0].time_min < results[0].time_max

    def test_created_by_set_to_model_type(self):
        t = np.linspace(0.0, 1.0, 50)
        results = merge_detections([10], 5, t, "ev", "minirocket")
        assert results[0].created_by == "minirocket"
        assert results[0].validated is False
