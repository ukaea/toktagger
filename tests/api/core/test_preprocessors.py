import numpy as np
import pytest

from toktagger.api.core.preprocessors import apply_preprocessing
from toktagger.api.schemas.data import MultiVariateTimeSeriesData, TimeSeriesData
from toktagger.api.schemas.preprocessing import (
    BackgroundSubtractionStep,
    NormalisationStep,
    PreprocessingConfig,
    SmoothingStep,
)


def make_data(
    values: list[float], signal_name: str = "Ip"
) -> MultiVariateTimeSeriesData:
    ts = TimeSeriesData(time=list(range(len(values))), values=values)
    return MultiVariateTimeSeriesData(values={signal_name: ts})


# --- No-op cases ---


def test_empty_config_returns_same_object():
    data = make_data([1.0, 2.0, 3.0])
    config = PreprocessingConfig(steps=[])
    assert apply_preprocessing(data, config) is data


def test_unknown_signal_silently_skipped():
    data = make_data([1.0, 2.0, 3.0], signal_name="Ip")
    config = PreprocessingConfig(
        steps=[SmoothingStep(signal_name="DoesNotExist", sigma=2.0)]
    )
    result = apply_preprocessing(data, config)
    assert result.values["Ip"].values == pytest.approx([1.0, 2.0, 3.0])
    assert "DoesNotExist" not in result.values


def test_original_data_not_mutated():
    original = [1.0, 2.0, 3.0, 4.0, 5.0]
    data = make_data(original[:])
    config = PreprocessingConfig(steps=[SmoothingStep(signal_name="Ip", sigma=1.0)])
    apply_preprocessing(data, config)
    assert data.values["Ip"].values == original


# --- Smoothing ---


def test_smoothing_gaussian_preserves_length():
    data = make_data(list(range(100)))
    config = PreprocessingConfig(
        steps=[SmoothingStep(signal_name="Ip", method="gaussian", sigma=2.0)]
    )
    result = apply_preprocessing(data, config)
    assert len(result.values["Ip"].values) == 100


def test_smoothing_gaussian_reduces_variance_on_noisy_signal():
    rng = np.random.default_rng(42)
    values = (rng.random(200) * 10).tolist()
    data = make_data(values)
    config = PreprocessingConfig(
        steps=[SmoothingStep(signal_name="Ip", method="gaussian", sigma=5.0)]
    )
    result = apply_preprocessing(data, config)
    assert float(np.var(result.values["Ip"].values)) < float(np.var(values))


def test_smoothing_gaussian_constant_signal_unchanged():
    values = [5.0] * 100
    data = make_data(values)
    config = PreprocessingConfig(
        steps=[SmoothingStep(signal_name="Ip", method="gaussian", sigma=3.0)]
    )
    result = apply_preprocessing(data, config)
    assert result.values["Ip"].values == pytest.approx(values, abs=1e-6)


def test_smoothing_uniform_preserves_length():
    data = make_data(list(range(50)))
    config = PreprocessingConfig(
        steps=[SmoothingStep(signal_name="Ip", method="uniform", sigma=5.0)]
    )
    result = apply_preprocessing(data, config)
    assert len(result.values["Ip"].values) == 50


def test_smoothing_uniform_constant_signal_unchanged():
    values = [3.0] * 80
    data = make_data(values)
    config = PreprocessingConfig(
        steps=[SmoothingStep(signal_name="Ip", method="uniform", sigma=10.0)]
    )
    result = apply_preprocessing(data, config)
    assert result.values["Ip"].values == pytest.approx(values, abs=1e-6)


# --- Background subtraction ---


def test_background_subtraction_preserves_length():
    data = make_data(list(range(200)))
    config = PreprocessingConfig(
        steps=[BackgroundSubtractionStep(signal_name="Ip", window_size=20)]
    )
    result = apply_preprocessing(data, config)
    assert len(result.values["Ip"].values) == 200


def test_background_subtraction_constant_signal_yields_zero():
    values = [3.0] * 500
    data = make_data(values)
    config = PreprocessingConfig(
        steps=[BackgroundSubtractionStep(signal_name="Ip", window_size=100)]
    )
    result = apply_preprocessing(data, config)
    assert result.values["Ip"].values == pytest.approx([0.0] * 500, abs=1e-10)


def test_background_subtraction_removes_linear_trend():
    # For a linear ramp the moving-average trend tracks the ramp closely;
    # interior residuals should be small.
    values = [float(i) for i in range(1000)]
    data = make_data(values)
    config = PreprocessingConfig(
        steps=[BackgroundSubtractionStep(signal_name="Ip", window_size=50)]
    )
    result = apply_preprocessing(data, config)
    interior = result.values["Ip"].values[50:950]
    assert max(abs(v) for v in interior) < 26  # window/2 = 25


# --- Normalisation ---


def test_normalisation_zscore_mean_near_zero():
    data = make_data([1.0, 2.0, 3.0, 4.0, 5.0])
    config = PreprocessingConfig(
        steps=[NormalisationStep(signal_name="Ip", method="zscore")]
    )
    result = apply_preprocessing(data, config)
    assert float(np.mean(result.values["Ip"].values)) == pytest.approx(0.0, abs=1e-6)


def test_normalisation_zscore_std_near_one():
    rng = np.random.default_rng(0)
    values = rng.normal(10, 5, 200).tolist()
    data = make_data(values)
    config = PreprocessingConfig(
        steps=[NormalisationStep(signal_name="Ip", method="zscore")]
    )
    result = apply_preprocessing(data, config)
    assert float(np.std(result.values["Ip"].values)) == pytest.approx(1.0, abs=1e-3)


def test_normalisation_minmax_range_zero_to_one():
    values = [3.0, 1.0, 4.0, 1.0, 5.0, 9.0, 2.0, 6.0]
    data = make_data(values)
    config = PreprocessingConfig(
        steps=[NormalisationStep(signal_name="Ip", method="minmax")]
    )
    result = apply_preprocessing(data, config)
    result_values = result.values["Ip"].values
    assert min(result_values) == pytest.approx(0.0, abs=1e-6)
    assert max(result_values) == pytest.approx(1.0, abs=1e-6)


def test_normalisation_preserves_length():
    data = make_data(list(range(50)))
    config = PreprocessingConfig(
        steps=[NormalisationStep(signal_name="Ip", method="zscore")]
    )
    result = apply_preprocessing(data, config)
    assert len(result.values["Ip"].values) == 50


# --- Step ordering and multi-signal isolation ---


def test_multiple_steps_applied_in_order():
    # normalise-then-smooth and smooth-then-normalise should give different results
    values = [float(i % 7) for i in range(100)]
    data = make_data(values)

    config_ns = PreprocessingConfig(
        steps=[
            NormalisationStep(signal_name="Ip", method="zscore"),
            SmoothingStep(signal_name="Ip", sigma=3.0),
        ]
    )
    config_sn = PreprocessingConfig(
        steps=[
            SmoothingStep(signal_name="Ip", sigma=3.0),
            NormalisationStep(signal_name="Ip", method="zscore"),
        ]
    )

    r_ns = apply_preprocessing(data, config_ns).values["Ip"].values
    r_sn = apply_preprocessing(data, config_sn).values["Ip"].values
    assert not np.allclose(r_ns, r_sn)


def test_step_on_one_signal_does_not_affect_another():
    ts_ip = TimeSeriesData(time=list(range(50)), values=[float(i) for i in range(50)])
    ts_ne = TimeSeriesData(time=list(range(50)), values=[10.0] * 50)
    data = MultiVariateTimeSeriesData(values={"Ip": ts_ip, "Ne": ts_ne})

    config = PreprocessingConfig(
        steps=[NormalisationStep(signal_name="Ip", method="zscore")]
    )
    result = apply_preprocessing(data, config)

    assert result.values["Ne"].values == [10.0] * 50
    assert result.values["Ip"].values != pytest.approx([float(i) for i in range(50)])
