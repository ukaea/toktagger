import numpy
import pytest

from toktagger.api.core.views import RadialProfileView
from toktagger.api.schemas.data import (
    MultiSignalData,
    MultiVariateTimeSeriesData,
    TimeSeriesData,
)
from toktagger.api.schemas.views import RadialProfileViewParams
from tests.radial_definitions import (
    RADIAL_CHANNELS,
    RADIAL_GAP_CHANNEL,
    RADIAL_TIME,
    synthetic_radius,
    synthetic_signals,
)


def test_radial_profile_view_defaults_to_first_profile():
    data = MultiSignalData(values=synthetic_signals())
    result = RadialProfileView(RadialProfileViewParams())(data)

    assert result.profile_signal == "TE"
    assert result.time == RADIAL_TIME.tolist()
    # Without a radius signal, dim_1 is broadcast to every slice
    assert all(row == RADIAL_CHANNELS.tolist() for row in result.radius)
    assert list(result.time_series) == ["ip"]


def test_radial_profile_view_uses_radius_signal_and_nulls_nan():
    data = MultiSignalData(values=synthetic_signals())
    result = RadialProfileView(
        RadialProfileViewParams(profile_signal="TE", radius_signal="R")
    )(data)

    assert numpy.allclose(numpy.array(result.radius, dtype=float), synthetic_radius())
    assert all(row[RADIAL_GAP_CHANNEL] is None for row in result.values)
    assert len(result.values) == len(RADIAL_TIME)


@pytest.mark.parametrize(
    "params,message",
    [
        (RadialProfileViewParams(profile_signal="ip"), "does not exist"),
        (RadialProfileViewParams(radius_signal="nope"), "does not exist"),
    ],
)
def test_radial_profile_view_invalid_signals(params, message):
    data = MultiSignalData(values=synthetic_signals())
    with pytest.raises(RuntimeError, match=message):
        RadialProfileView(params)(data)


def test_radial_profile_view_requires_profile():
    data = MultiVariateTimeSeriesData(
        values={"ip": TimeSeriesData(time=[0, 1], values=[0, 1])}
    )
    with pytest.raises(RuntimeError, match="No 2D profile"):
        RadialProfileView(RadialProfileViewParams())(data)
