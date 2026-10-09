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
    synthetic_ne,
    synthetic_signals,
)


def signal_data(*names: str) -> MultiSignalData:
    signals = synthetic_signals()
    return MultiSignalData(values={name: signals[name] for name in names})


def test_radial_profile_view_shows_all_profiles_in_order():
    result = RadialProfileView(RadialProfileViewParams())(signal_data("TE", "NE", "ip"))

    assert list(result.profiles) == ["TE", "NE"]
    assert result.time == RADIAL_TIME.tolist()
    # Without a radius signal, dim_1 is broadcast to every slice
    assert all(row == RADIAL_CHANNELS.tolist() for row in result.radius)
    assert list(result.time_series) == ["ip"]


def test_radial_profile_view_nulls_nan():
    result = RadialProfileView(RadialProfileViewParams())(signal_data("TE", "NE"))

    assert numpy.allclose(
        numpy.array(result.profiles["NE"], dtype=float), synthetic_ne()
    )
    assert all(row[RADIAL_GAP_CHANNEL] is None for row in result.profiles["TE"])
    assert len(result.profiles["TE"]) == len(RADIAL_TIME)


def test_radial_profile_view_rejects_mismatched_grids():
    with pytest.raises(RuntimeError, match="not on the same grid"):
        RadialProfileView(RadialProfileViewParams())(signal_data("TE", "NE_COARSE"))


def test_radial_profile_view_requires_profile():
    data = MultiVariateTimeSeriesData(
        values={"ip": TimeSeriesData(time=[0, 1], values=[0, 1])}
    )
    with pytest.raises(RuntimeError, match="No 2D profile"):
        RadialProfileView(RadialProfileViewParams())(data)
