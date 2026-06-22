"""Unit tests for new model features: multivariate, params, NMS, backward compat.

These tests bypass Ray by constructing model instances with object.__new__
and injecting a mocked data_loader. This lets us test the model logic itself
without requiring a running Ray cluster.
"""

import pickle
import tempfile
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from toktagger.api.models.dtw_motif import DTWMotifModel, DTWMotifTrainParams
from toktagger.api.models.minirocket import MiniRocketModel, MiniRocketTrainParams
from toktagger.api.models.stumpy_motif import (
    StumpyMotifModel,
    StumpyMotifPredictParams,
    StumpyMotifTrainParams,
)
from toktagger.api.schemas.annotations import AnnotationBase, TimeRegion
from toktagger.api.schemas.data import MultiVariateTimeSeriesData, TimeSeriesData

pytestmark = pytest.mark.models_enabled

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def make_model_instance(cls):
    """Construct a Model subclass without the Ray-dependent __init__."""
    inst = object.__new__(cls)
    inst.id = "test_model_id"
    inst.project = MagicMock()
    inst.model = inst.define_model()
    inst.data_loader = MagicMock()
    inst._trained = False
    # Prevent log_progress from making real HTTP requests (API_URL may be set in CI)
    inst.log_progress = MagicMock()
    return inst


def make_mv_data(
    signal_names: list[str], n: int = 500, seed: int = 0
) -> MultiVariateTimeSeriesData:
    """Return MultiVariateTimeSeriesData with reproducible Gaussian signals."""
    rng = np.random.default_rng(seed)
    time = np.linspace(0, 10, n).tolist()
    return MultiVariateTimeSeriesData(
        values={
            name: TimeSeriesData(time=time, values=rng.standard_normal(n).tolist())
            for name in signal_names
        }
    )


def make_annotation(t0: float, t1: float, label: str = "Event") -> TimeRegion:
    return TimeRegion(
        time_min=t0,
        time_max=t1,
        label=label,
        validated=True,
        uncertainty=0.0,
        created_by="manual",
    )


def make_sample() -> MagicMock:
    s = MagicMock()
    s.id = "sample_id"
    s.shot_id = 1
    return s


# ---------------------------------------------------------------------------
# DTW Motif
# ---------------------------------------------------------------------------


class TestDTWMotif:
    def _make_trained(
        self, signal_names: list[str], window_size: int = 50
    ) -> DTWMotifModel:
        model = make_model_instance(DTWMotifModel)
        data = make_mv_data(signal_names, n=500)
        model.data_loader.get_sample.return_value = data
        sample = make_sample()
        ann = make_annotation(2.0, 3.0)
        params = DTWMotifTrainParams(
            signal_names=signal_names,
            threshold=5.0,
            window_size=window_size,
        )
        model.train([sample], [[ann]], params)
        model._trained = True
        return model

    def test_train_returns_score(self):
        model = make_model_instance(DTWMotifModel)
        data = make_mv_data(["Ip"], n=500)
        model.data_loader.get_sample.return_value = data
        sample = make_sample()
        ann = make_annotation(2.0, 3.0)
        params = DTWMotifTrainParams(signal_names=["Ip"], window_size=50)
        score = model.train([sample], [[ann]], params)
        assert isinstance(score, float)

    def test_window_size_param_stored(self):
        model = self._make_trained(["Ip"], window_size=42)
        assert model.model["window_size"] == 42

    def test_predict_returns_annotation_lists(self):
        model = self._make_trained(["Ip"])
        sample = make_sample()
        result = model.predict([sample])
        assert isinstance(result, list)
        assert len(result) == 1
        assert isinstance(result[0], list)
        assert all(isinstance(a, AnnotationBase) for a in result[0])

    def test_multivariate_train_predict(self):
        signal_names = ["Ip", "dalpha"]
        model = self._make_trained(signal_names)
        sample = make_sample()
        result = model.predict([sample])
        assert len(result) == 1
        assert isinstance(result[0], list)

    def test_backward_compat_load(self):
        model = make_model_instance(DTWMotifModel)
        old_state = {
            "signal_name": "Ip",
            "templates": [],
            "window_size": 100,
            "threshold": 3.0,
        }
        with tempfile.NamedTemporaryFile(suffix=".pkl", delete=False) as f:
            pickle.dump(old_state, f)
            path = f.name
        model.load(path)
        assert model.model["signal_names"] == ["Ip"]
        assert "signal_name" not in model.model or model.model.get("signal_names")


# ---------------------------------------------------------------------------
# STUMPY Motif
# ---------------------------------------------------------------------------


class TestStumpyMotif:
    def _make_trained(
        self, signal_names: list[str], threshold: float = 5.0
    ) -> StumpyMotifModel:
        model = make_model_instance(StumpyMotifModel)
        data = make_mv_data(signal_names, n=500)
        model.data_loader.get_sample.return_value = data
        sample = make_sample()
        ann = make_annotation(2.0, 3.0)
        params = StumpyMotifTrainParams(signal_names=signal_names, threshold=threshold)
        model.train([sample], [[ann]], params)
        model._trained = True
        return model

    def test_train_returns_score(self):
        model = make_model_instance(StumpyMotifModel)
        data = make_mv_data(["Ip"], n=500)
        model.data_loader.get_sample.return_value = data
        sample = make_sample()
        ann = make_annotation(2.0, 3.0)
        params = StumpyMotifTrainParams(signal_names=["Ip"], threshold=3.0)
        score = model.train([sample], [[ann]], params)
        assert score == 100.0

    def test_predict_returns_annotation_lists(self):
        model = self._make_trained(["Ip"])
        sample = make_sample()
        result = model.predict([sample])
        assert isinstance(result, list)
        assert len(result) == 1
        assert all(isinstance(a, AnnotationBase) for a in result[0])

    def test_predict_threshold_override_increases_hits(self):
        """A very low threshold should yield at least as many hits as a high one."""
        model = self._make_trained(["Ip"], threshold=3.0)
        sample = make_sample()
        # Very permissive threshold
        low_result = model.predict([sample], StumpyMotifPredictParams(threshold=0.001))
        # Very strict threshold (effectively no detections)
        high_result = model.predict([sample], StumpyMotifPredictParams(threshold=1e6))
        assert len(low_result[0]) >= len(high_result[0])

    def test_predict_uses_training_threshold_by_default(self):
        """predict() with no params should give the same result as passing the trained threshold explicitly."""
        training_threshold = 2.5
        model = self._make_trained(["Ip"], threshold=training_threshold)
        sample = make_sample()
        default_result = model.predict([sample])
        explicit_result = model.predict(
            [sample], StumpyMotifPredictParams(threshold=training_threshold)
        )
        assert len(default_result[0]) == len(explicit_result[0])

    def test_multivariate_train_predict(self):
        model = self._make_trained(["Ip", "dalpha"])
        sample = make_sample()
        result = model.predict([sample])
        assert len(result) == 1
        assert isinstance(result[0], list)

    def test_backward_compat_load(self):
        model = make_model_instance(StumpyMotifModel)
        old_state = {
            "signal_name": "Ip",
            "templates": [],
            "window_size": 100,
            "threshold": 3.0,
        }
        with tempfile.NamedTemporaryFile(suffix=".pkl", delete=False) as f:
            pickle.dump(old_state, f)
            path = f.name
        model.load(path)
        assert model.model["signal_names"] == ["Ip"]


# ---------------------------------------------------------------------------
# MiniRocket
# ---------------------------------------------------------------------------


class TestMiniRocket:
    def _make_trained(self, signal_names: list[str]) -> MiniRocketModel:
        model = make_model_instance(MiniRocketModel)
        data = make_mv_data(signal_names, n=500)
        model.data_loader.get_sample.return_value = data
        sample = make_sample()
        ann = make_annotation(2.0, 3.0)
        params = MiniRocketTrainParams(
            signal_names=signal_names,
            n_background_per_shot=5,
            num_kernels=100,
        )
        model.train([sample], [[ann]], params)
        model._trained = True
        return model

    def test_train_predict_single_channel(self):
        model = self._make_trained(["Ip"])
        sample = make_sample()
        result = model.predict([sample])
        assert isinstance(result, list)
        assert len(result) == 1
        assert all(isinstance(a, AnnotationBase) for a in result[0])

    def test_nms_is_called_during_predict(self):
        model = self._make_trained(["Ip"])
        sample = make_sample()
        with patch(
            "toktagger.api.models.minirocket.non_max_suppression",
            wraps=lambda x: x,
        ) as mock_nms:
            model.predict([sample])
        mock_nms.assert_called_once()

    def test_multivariate_train_predict(self):
        model = self._make_trained(["Ip", "dalpha"])
        sample = make_sample()
        result = model.predict([sample])
        assert len(result) == 1
        assert isinstance(result[0], list)

    def test_backward_compat_load(self):
        model = make_model_instance(MiniRocketModel)
        old_state = {
            "signal_name": "Ip",
            "transformer": None,
            "classifier": None,
            "window_size": 100,
            "pos_label": "Event",
        }
        with tempfile.NamedTemporaryFile(suffix=".pkl", delete=False) as f:
            pickle.dump(old_state, f)
            path = f.name
        model.load(path)
        assert model.model["signal_names"] == ["Ip"]


# ---------------------------------------------------------------------------
# Shapelet Transform
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def sktime():
    return pytest.importorskip("sktime")


class TestShapelet:
    def test_train_predict(self, sktime):
        from toktagger.api.models.shapelet import (
            ShapeletTrainParams,
            ShapeletTransformModel,
        )

        model = make_model_instance(ShapeletTransformModel)
        data = make_mv_data(["Ip"], n=300)
        model.data_loader.get_sample.return_value = data
        sample = make_sample()
        ann = make_annotation(2.0, 3.0)
        params = ShapeletTrainParams(
            signal_names=["Ip"],
            n_background_per_shot=5,
            max_shapelets=2,
            n_shapelet_samples=20,
            batch_size=10,
        )
        score = model.train([sample], [[ann]], params)
        assert isinstance(score, float)

        model._trained = True
        result = model.predict([sample])
        assert isinstance(result, list)
        assert len(result) == 1
        assert all(isinstance(a, AnnotationBase) for a in result[0])
