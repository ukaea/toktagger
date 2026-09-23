"""Unit tests for new model features: multivariate, params, NMS, backward compat.

These tests bypass Ray by constructing model instances with object.__new__
and injecting a mocked data_loader. This lets us test the model logic itself
without requiring a running Ray cluster.
"""

import pathlib
import pickle
import tempfile
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from toktagger.api.models.dtw_motif import (
    DTWMotifModel,
    DTWMotifPredictParams,
    DTWMotifTrainParams,
)
from toktagger.api.models.event_detection_utils import (
    MissingSignalError,
    SignalAlignmentError,
    zscore,
)
from toktagger.api.models.minirocket import (
    MINIROCKET_MIN_WINDOW,
    MiniRocketModel,
    MiniRocketTrainParams,
)
from toktagger.api.models.stumpy_motif import (
    StumpyMotifModel,
    StumpyMotifPredictParams,
    StumpyMotifTrainParams,
)
from toktagger.api.schemas.annotations import AnnotationBase, TimeRegion
from toktagger.api.schemas.data import MultiVariateTimeSeriesData, TimeSeriesData

pytestmark = pytest.mark.models_enabled

# --- Shared helpers ---


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


# --- DTW Motif ---


def _make_trained_dtw_motif(
    signal_names: list[str], window_size: int = 50
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


def test_dtw_motif_train_returns_score():
    model = make_model_instance(DTWMotifModel)
    data = make_mv_data(["Ip"], n=500)
    model.data_loader.get_sample.return_value = data
    sample = make_sample()
    ann = make_annotation(2.0, 3.0)
    params = DTWMotifTrainParams(signal_names=["Ip"], window_size=50)
    score = model.train([sample], [[ann]], params)
    assert isinstance(score, float)


def test_dtw_motif_window_size_param_stored():
    model = _make_trained_dtw_motif(["Ip"], window_size=42)
    assert model.model["window_size"] == 42


def test_dtw_motif_predict_returns_annotation_lists():
    model = _make_trained_dtw_motif(["Ip"])
    sample = make_sample()
    result = model.predict([sample])
    assert isinstance(result, list)
    assert len(result) == 1
    assert isinstance(result[0], list)
    assert all(isinstance(a, AnnotationBase) for a in result[0])


def test_dtw_motif_multivariate_train_predict():
    signal_names = ["Ip", "dalpha"]
    model = _make_trained_dtw_motif(signal_names)
    sample = make_sample()
    result = model.predict([sample])
    assert len(result) == 1
    assert isinstance(result[0], list)


def test_dtw_motif_class_label_filters_templates():
    model = make_model_instance(DTWMotifModel)
    data = make_mv_data(["Ip"], n=500)
    model.data_loader.get_sample.return_value = data
    sample = make_sample()
    anns = [
        make_annotation(2.0, 3.0, label="ELM"),
        make_annotation(5.0, 6.0, label="L-mode"),
    ]
    params = DTWMotifTrainParams(signal_names=["Ip"], window_size=50, class_label="ELM")
    model.train([sample], [anns], params)
    labels = {label for _, label in model.model["templates"]}
    assert labels == {"ELM"}


def test_dtw_motif_backward_compat_load():
    model = make_model_instance(DTWMotifModel)
    old_state = {
        "signal_name": "Ip",
        "templates": [],
        "window_size": 100,
        "threshold": 3.0,
    }
    results_dir = pathlib.Path(tempfile.mkdtemp())
    with open(results_dir.joinpath("weights.model"), "wb") as f:
        pickle.dump(old_state, f)
    model.load(results_dir)
    assert model.model["signal_names"] == ["Ip"]
    assert "signal_name" not in model.model or model.model.get("signal_names")


# --- STUMPY Motif ---


def _make_trained_stumpy_motif(
    signal_names: list[str], threshold: float = 5.0
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


def test_stumpy_motif_train_returns_score():
    model = make_model_instance(StumpyMotifModel)
    data = make_mv_data(["Ip"], n=500)
    model.data_loader.get_sample.return_value = data
    sample = make_sample()
    ann = make_annotation(2.0, 3.0)
    params = StumpyMotifTrainParams(signal_names=["Ip"], threshold=3.0)
    score = model.train([sample], [[ann]], params)
    assert score == 100.0


def test_stumpy_motif_predict_returns_annotation_lists():
    model = _make_trained_stumpy_motif(["Ip"])
    sample = make_sample()
    result = model.predict([sample])
    assert isinstance(result, list)
    assert len(result) == 1
    assert all(isinstance(a, AnnotationBase) for a in result[0])


def test_stumpy_motif_predict_threshold_controls_detection_extent():
    """A stricter (lower) threshold should detect a smaller extent of the
    signal than a more permissive (higher) threshold, for the same trained
    template — using controlled data with a known, separated match/mismatch
    rather than relying on merge behaviour to coincidentally produce equal
    counts."""
    window_size = 30
    n = 300
    time = np.linspace(0, 10, n).tolist()
    rng = np.random.default_rng(0)

    background = rng.standard_normal(n)
    template_raw = rng.standard_normal(window_size)

    # Inject an exact copy of the template so its MASS distance from the trained template is ~0, unlike the noisy background.
    inject_start = 150
    values = background.copy()
    values[inject_start : inject_start + window_size] = template_raw

    model = make_model_instance(StumpyMotifModel)
    model.model = {
        "templates": [(zscore(template_raw), "Event")],
        "window_size": window_size,
        "signal_names": ["Ip"],
        "threshold": 1.0,
    }
    model._trained = True
    data = MultiVariateTimeSeriesData(
        values={"Ip": TimeSeriesData(time=time, values=values.tolist())}
    )
    model.data_loader.get_sample.return_value = data

    sample = make_sample()

    strict_result = model.predict([sample], StumpyMotifPredictParams(threshold=1.0))
    permissive_result = model.predict(
        [sample], StumpyMotifPredictParams(threshold=50.0)
    )

    def total_span(regions):
        return sum(r.time_max - r.time_min for r in regions)

    assert len(strict_result[0]) >= 1
    assert total_span(permissive_result[0]) > total_span(strict_result[0])


def test_stumpy_motif_predict_uses_training_threshold_by_default():
    """predict() with no params should give the same result as passing the trained threshold explicitly."""
    training_threshold = 2.5
    model = _make_trained_stumpy_motif(["Ip"], threshold=training_threshold)
    sample = make_sample()
    default_result = model.predict([sample])
    explicit_result = model.predict(
        [sample], StumpyMotifPredictParams(threshold=training_threshold)
    )
    assert len(default_result[0]) == len(explicit_result[0])


def test_stumpy_motif_multivariate_train_predict_uses_second_channel():
    """Detection should depend on the second channel's content, not just
    the first. Ip carries independent noise at train vs. predict time (no
    self-matching artifact possible), while dalpha carries a distinctive
    pulse at the same location both times — so a bug that ignored the
    second channel would fail to localise the detection correctly."""
    n = 500
    time = np.linspace(0, 10, n).tolist()
    ann_start_idx = int(np.searchsorted(time, 2.0))
    ann_end_idx = int(np.searchsorted(time, 3.0))
    pulse = np.sin(np.linspace(0, 3 * np.pi, ann_end_idx - ann_start_idx))

    def make_data(ip_seed: int) -> MultiVariateTimeSeriesData:
        ip_values = np.random.default_rng(ip_seed).standard_normal(n)
        dalpha_values = 0.01 * np.random.default_rng(99).standard_normal(n)
        dalpha_values[ann_start_idx:ann_end_idx] = pulse
        return MultiVariateTimeSeriesData(
            values={
                "Ip": TimeSeriesData(time=time, values=ip_values.tolist()),
                "dalpha": TimeSeriesData(time=time, values=dalpha_values.tolist()),
            }
        )

    train_data = make_data(ip_seed=1)
    predict_data = make_data(ip_seed=2)

    model = make_model_instance(StumpyMotifModel)
    model.data_loader.get_sample.side_effect = [train_data, predict_data]
    sample = make_sample()
    ann = make_annotation(2.0, 3.0)
    # Averaging Ip's mismatched-noise distance (~9-10) with dalpha's near-0 match gives ~5, vs ~9-10 for background elsewhere, so 7.0 only catches the true match.
    params = StumpyMotifTrainParams(signal_names=["Ip", "dalpha"], threshold=7.0)
    model.train([sample], [[ann]], params)
    model._trained = True

    result = model.predict([sample])
    assert len(result) == 1
    assert len(result[0]) >= 1
    assert any(r.time_min <= 3.0 and r.time_max >= 2.0 for r in result[0])


def test_stumpy_motif_detect_handles_signal_length_equal_to_window_size():
    """A signal exactly as long as the window still yields one valid
    comparison and should not be rejected outright."""
    model = make_model_instance(StumpyMotifModel)
    window_size = 20
    rng = np.random.default_rng(0)
    pattern = rng.standard_normal(window_size)
    model.model = {
        "templates": [(zscore(pattern), "Event")],
        "window_size": window_size,
        "signal_names": ["Ip"],
        "threshold": 1.0,
    }
    time_array = np.linspace(0, 1, window_size)

    result = model._detect(pattern, time_array)
    assert len(result) == 1


def test_stumpy_motif_class_label_filters_templates():
    model = make_model_instance(StumpyMotifModel)
    data = make_mv_data(["Ip"], n=500)
    model.data_loader.get_sample.return_value = data
    sample = make_sample()
    anns = [
        make_annotation(2.0, 3.0, label="ELM"),
        make_annotation(5.0, 6.0, label="L-mode"),
    ]
    params = StumpyMotifTrainParams(
        signal_names=["Ip"], threshold=3.0, class_label="ELM"
    )
    model.train([sample], [anns], params)
    labels = {label for _, label in model.model["templates"]}
    assert labels == {"ELM"}


def test_stumpy_motif_backward_compat_load():
    model = make_model_instance(StumpyMotifModel)
    old_state = {
        "signal_name": "Ip",
        "templates": [],
        "window_size": 100,
        "threshold": 3.0,
    }
    results_dir = pathlib.Path(tempfile.mkdtemp())
    with open(results_dir.joinpath("weights.model"), "wb") as f:
        pickle.dump(old_state, f)
    model.load(results_dir)
    assert model.model["signal_names"] == ["Ip"]


# --- MiniRocket ---


def _make_trained_minirocket(signal_names: list[str]) -> MiniRocketModel:
    model = make_model_instance(MiniRocketModel)
    data = make_mv_data(signal_names, n=500)
    model.data_loader.get_sample.return_value = data
    sample = make_sample()
    ann = make_annotation(2.0, 3.0)
    params = MiniRocketTrainParams(
        signal_names=signal_names,
        n_background_per_shot=5,
        num_kernels=100,
        class_label="Event",
    )
    model.train([sample], [[ann]], params)
    model._trained = True
    return model


def test_minirocket_train_predict_single_channel():
    model = _make_trained_minirocket(["Ip"])
    sample = make_sample()
    result = model.predict([sample])
    assert isinstance(result, list)
    assert len(result) == 1
    assert all(isinstance(a, AnnotationBase) for a in result[0])


def test_minirocket_nms_is_called_during_predict():
    model = _make_trained_minirocket(["Ip"])
    sample = make_sample()
    with patch(
        "toktagger.api.models.minirocket.non_max_suppression",
        wraps=lambda x: x,
    ) as mock_nms:
        model.predict([sample])
    mock_nms.assert_called_once()


def test_minirocket_multivariate_train_predict():
    model = _make_trained_minirocket(["Ip", "dalpha"])
    sample = make_sample()
    result = model.predict([sample])
    assert len(result) == 1
    assert isinstance(result[0], list)


def test_minirocket_train_uses_background_only_sample_as_negatives():
    model = make_model_instance(MiniRocketModel)
    data = make_mv_data(["Ip"], n=500)
    model.data_loader.get_sample.return_value = data
    event_sample = make_sample()
    background_sample = make_sample()
    ann = make_annotation(2.0, 3.0)
    params = MiniRocketTrainParams(
        signal_names=["Ip"],
        n_background_per_shot=5,
        num_kernels=100,
        class_label="Event",
    )
    # background_sample has no annotations because it was reviewed and confirmed to hold no events, so it should still contribute negative windows.
    score = model.train([event_sample, background_sample], [[ann], []], params)
    assert isinstance(score, float)


def test_minirocket_train_raises_without_negative_windows():
    model = make_model_instance(MiniRocketModel)
    # Annotation spans almost the entire signal, so no window-sized gap is left to sample a background window from.
    data = make_mv_data(["Ip"], n=60)
    model.data_loader.get_sample.return_value = data
    sample = make_sample()
    ann = make_annotation(0.0, 10.0)
    params = MiniRocketTrainParams(
        signal_names=["Ip"],
        n_background_per_shot=3,
        num_kernels=100,
        class_label="Event",
    )
    with pytest.raises(ValueError, match="requires both event and background"):
        model.train([sample], [[ann]], params)


def test_minirocket_train_pads_window_size_below_minirocket_minimum():
    model = make_model_instance(MiniRocketModel)
    data = make_mv_data(["Ip"], n=500)
    model.data_loader.get_sample.return_value = data
    event_sample = make_sample()
    background_sample = make_sample()
    # Very short annotation duration infers a window_size below the 9-sample minimum sktime's MiniRocket transform requires.
    ann = make_annotation(2.0, 2.1)
    params = MiniRocketTrainParams(
        signal_names=["Ip"],
        n_background_per_shot=5,
        num_kernels=100,
        class_label="Event",
    )
    model.train([event_sample, background_sample], [[ann], []], params)
    assert model.model["window_size"] == MINIROCKET_MIN_WINDOW


def test_minirocket_backward_compat_load():
    model = make_model_instance(MiniRocketModel)
    old_state = {
        "signal_name": "Ip",
        "transformer": None,
        "classifier": None,
        "window_size": 100,
        "pos_label": "Event",
    }
    results_dir = pathlib.Path(tempfile.mkdtemp())
    with open(results_dir.joinpath("weights.model"), "wb") as f:
        pickle.dump(old_state, f)
    model.load(results_dir)
    assert model.model["signal_names"] == ["Ip"]


# --- Shapelet Transform ---


@pytest.fixture(scope="module")
def sktime():
    return pytest.importorskip("sktime")


def test_shapelet_train_predict(sktime):
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
        class_label="Event",
    )
    score = model.train([sample], [[ann]], params)
    assert isinstance(score, float)

    model._trained = True
    result = model.predict([sample])
    assert isinstance(result, list)
    assert len(result) == 1
    assert all(isinstance(a, AnnotationBase) for a in result[0])


# --- Signal loading and alignment ---


def make_ranged_data(
    ranges: dict[str, tuple[float, float, int]], seed: int = 0
) -> MultiVariateTimeSeriesData:
    """Return data where each signal covers its own time range and rate."""
    rng = np.random.default_rng(seed)
    return MultiVariateTimeSeriesData(
        values={
            name: TimeSeriesData(
                time=np.linspace(start, stop, n).tolist(),
                values=rng.standard_normal(n).tolist(),
            )
            for name, (start, stop, n) in ranges.items()
        }
    )


def test_train_skips_sample_which_misses_a_signal():
    model = make_model_instance(DTWMotifModel)
    model.data_loader.get_sample.side_effect = [
        make_mv_data(["dalpha"], n=500),
        make_mv_data(["Ip"], n=500),
    ]
    ann = make_annotation(2.0, 3.0)
    params = DTWMotifTrainParams(signal_names=["Ip"], window_size=50)
    score = model.train([make_sample(), make_sample()], [[ann], [ann]], params)
    assert isinstance(score, float)


def test_train_raises_when_no_sample_holds_the_signals():
    model = make_model_instance(DTWMotifModel)
    model.data_loader.get_sample.return_value = make_mv_data(["dalpha"], n=500)
    ann = make_annotation(2.0, 3.0)
    params = DTWMotifTrainParams(signal_names=["Ip"], window_size=50)
    with pytest.raises(ValueError, match="No annotated sample holds usable data"):
        model.train([make_sample()], [[ann]], params)


def test_predict_raises_when_a_signal_is_missing():
    model = _make_trained_dtw_motif(["Ip"])
    model.data_loader.get_sample.return_value = make_mv_data(["dalpha"], n=500)
    with pytest.raises(MissingSignalError, match="Ip"):
        model.predict([make_sample()], DTWMotifPredictParams())


def test_predict_raises_when_signals_have_no_common_time_range():
    model = _make_trained_dtw_motif(["Ip", "dalpha"])
    model.data_loader.get_sample.return_value = make_ranged_data(
        {"Ip": (0.0, 4.0, 200), "dalpha": (6.0, 10.0, 200)}
    )
    with pytest.raises(SignalAlignmentError, match="no common time range"):
        model.predict([make_sample()], DTWMotifPredictParams())


def test_multivariate_predictions_stay_inside_the_shared_time_range():
    model = make_model_instance(DTWMotifModel)
    data = make_ranged_data({"Ip": (0.0, 10.0, 1000), "dalpha": (2.0, 8.0, 600)})
    model.data_loader.get_sample.return_value = data
    sample = make_sample()
    ann = make_annotation(3.0, 4.0)
    params = DTWMotifTrainParams(
        signal_names=["Ip", "dalpha"], threshold=1e9, window_size=50
    )
    model.train([sample], [[ann]], params)
    model._trained = True

    detections = model.predict([sample], DTWMotifPredictParams(step_size=10))[0]
    assert detections
    assert all(2.0 <= d.time_min and d.time_max <= 8.0 for d in detections)
