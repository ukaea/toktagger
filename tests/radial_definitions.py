from typing import Type

import numpy as np

from toktagger.api.core.data_loaders import DataLoader, LoaderRegistry, _combine_signals
from toktagger.api.schemas.data import (
    DataParams,
    MultiProfile2DData,
    MultiSignalData,
    MultiVariateTimeSeriesData,
    Profile2DData,
    TimeSeriesData,
)
from toktagger.api.schemas.samples import Sample, ShotData

RADIAL_TIME = np.round(np.arange(0.01, 0.6, 0.02), 4)
RADIAL_CHANNELS = np.arange(1, 21, dtype=float)
RADIAL_GAP_CHANNEL = 9


def synthetic_radius() -> np.ndarray:
    """Thomson-like channel radii, shaped (time, channel), drifting slightly in time."""
    base = np.linspace(0.25, 1.45, RADIAL_CHANNELS.size)
    return base[None, :] + 0.01 * RADIAL_TIME[:, None]


def synthetic_te() -> np.ndarray:
    """Parabolic Te profile growing in time, with one dead channel (NaN)."""
    radius = synthetic_radius()
    shape = np.clip(1 - ((radius - 0.85) / 0.65) ** 2, 0, None)
    te = 1000 * shape * (RADIAL_TIME[:, None] / RADIAL_TIME.max())
    te[:, RADIAL_GAP_CHANNEL] = np.nan
    return te


def synthetic_signals() -> dict[str, TimeSeriesData | Profile2DData]:
    ip_time = np.linspace(0, 0.6, 300)
    return {
        "TE": Profile2DData(
            time=RADIAL_TIME, dim_1=RADIAL_CHANNELS, values=synthetic_te()
        ),
        "R": Profile2DData(
            time=RADIAL_TIME, dim_1=RADIAL_CHANNELS, values=synthetic_radius()
        ),
        "ip": TimeSeriesData(time=ip_time, values=np.sin(np.pi * ip_time / 0.6)),
    }


@LoaderRegistry.register("synthetic_radial")
class SyntheticRadialLoader(DataLoader):
    """Test-only loader returning a synthetic Thomson-like radial profile."""

    @classmethod
    def sample_data_type(cls) -> Type[ShotData]:
        return ShotData

    def get_sample(
        self, sample: Sample, params: DataParams, **kwargs
    ) -> MultiVariateTimeSeriesData | MultiProfile2DData | MultiSignalData:
        assert isinstance(sample.data, ShotData)
        signals = synthetic_signals()
        return _combine_signals(
            {name: signals.get(name) for name in sample.data.signal_names}
        )
