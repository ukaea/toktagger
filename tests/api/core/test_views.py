import numpy as np
import pytest
from pydantic import ValidationError
from scipy.datasets import electrocardiogram
from scipy.signal import stft

from toktagger.api.core.annotators import compute_stft
from toktagger.api.core.views import Profile2DView
from toktagger.api.schemas.data import (
    MultiProfile2DData,
    MultiVariateTimeSeriesData,
    Profile2DData,
    SpectrogramData,
    TimeSeriesData,
)
from toktagger.api.schemas.views import Profile2DViewParams, STFTParams, STFTWindow


@pytest.fixture
def ts_data() -> TimeSeriesData:
    values = electrocardiogram()[2000:4000]
    return TimeSeriesData(time=np.arange(len(values)).tolist(), values=values.tolist())


def test_compute_stft_defaults_match_previous_settings(ts_data):
    freq, ts, values = compute_stft(ts_data)
    expected_freq, expected_ts, expected_zxx = stft(
        np.array(ts_data.values), fs=1, nperseg=256, noverlap=128
    )

    np.testing.assert_allclose(freq, expected_freq / 1000)
    np.testing.assert_allclose(ts, expected_ts)
    np.testing.assert_allclose(values, np.abs(expected_zxx))


def test_compute_stft_custom_params(ts_data):
    params = STFTParams(nperseg=64, noverlap=16, window=STFTWindow.BLACKMAN, nfft=128)
    freq, ts, values = compute_stft(ts_data, params)
    _, _, expected_zxx = stft(
        np.array(ts_data.values),
        fs=1,
        window="blackman",
        nperseg=64,
        noverlap=16,
        nfft=128,
    )

    assert len(freq) == 128 // 2 + 1
    assert values.shape == (len(freq), len(ts))
    np.testing.assert_allclose(values, np.abs(expected_zxx))


def test_compute_stft_uses_longest_uniformly_sampled_region():
    # Mirrors UDA signals with a slow 1 ms base around a fast 5 us window.
    slow_before = np.arange(-2.5, -0.1, 1e-3)
    fast = np.arange(-0.1, 0.2, 5e-6)
    slow_after = np.arange(0.2, 1.0, 1e-3)
    time = np.concatenate([slow_before, fast, slow_after])
    values = np.random.default_rng(0).normal(size=len(time))

    _, ts, _ = compute_stft(TimeSeriesData(time=time.tolist(), values=values.tolist()))

    assert ts[0] == pytest.approx(fast[0])
    assert ts[-1] == pytest.approx(fast[-1], abs=256 * 5e-6)


@pytest.mark.parametrize(
    "kwargs",
    [
        {"nperseg": 64, "noverlap": 64},
        {"nperseg": 64, "noverlap": 80},
        {"nperseg": 64, "noverlap": 16, "nfft": 32},
        {"nperseg": 1, "noverlap": 0},
    ],
)
def test_stft_params_validation(kwargs):
    with pytest.raises(ValidationError):
        STFTParams(**kwargs)


def test_profile_2d_view_returns_spectrogram_for_time_series(ts_data):
    params = Profile2DViewParams(
        signal_name="Ip", stft=STFTParams(nperseg=64, noverlap=32)
    )
    result = Profile2DView(params)(MultiVariateTimeSeriesData(values={"Ip": ts_data}))

    assert isinstance(result, SpectrogramData)
    assert result.kind == "spectrogram"
    assert len(result.dim_1) == 64 // 2 + 1


def test_profile_2d_view_spectrogram_time_axis_for_mixed_sample_rates():
    # Mirrors UDA signals with a slow 1 ms base around a fast 5 us window.
    slow_before = np.arange(-2.5, -0.1, 1e-3)
    fast = np.arange(-0.1, 0.2, 5e-6)
    slow_after = np.arange(0.2, 1.0, 1e-3)
    time = np.concatenate([slow_before, fast, slow_after])
    values = np.random.default_rng(0).normal(size=len(time))
    signal = TimeSeriesData(time=time.tolist(), values=values.tolist())

    result = Profile2DView(Profile2DViewParams(signal_name="Ip"))(
        MultiVariateTimeSeriesData(values={"Ip": signal})
    )

    assert isinstance(result, SpectrogramData)
    assert result.time[0] == pytest.approx(fast[0])
    assert result.time[-1] == pytest.approx(fast[-1], abs=256 * 5e-6)
    assert max(result.dim_1) == pytest.approx(1 / (2 * 5e-6) / 1000, rel=1e-4)


def test_profile_2d_view_returns_profile_for_profile_data():
    profile = Profile2DData(
        time=[0.0, 1.0, 2.0],
        dim_1=[0.0, 1.0],
        values=[[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]],
    )
    params = Profile2DViewParams(signal_name="Ne")
    result = Profile2DView(params)(MultiProfile2DData(values={"Ne": profile}))

    assert type(result) is Profile2DData
