import numpy as np
import xarray as xr
from toktagger.api.core.annotators import compute_stft
from toktagger.api.schemas.data import (
    MultiVariateTimeSeriesData,
    SpectrogramData,
    Data,
    TimeSeriesData,
)
from toktagger.api.schemas.views import SpectrogramViewParams, ViewParams, ViewType


class IdentityView:
    def __init__(self, params: ViewParams):
        self.params = params

    def __call__(self, data: Data):
        return data


class SpectrogramView:
    def __init__(self, params: SpectrogramViewParams):
        if not isinstance(params, SpectrogramViewParams):
            raise RuntimeError(
                f"Invalid params type for SpectrogramView: {type(params)}"
            )

        self.params = params

    def __call__(
        self, data: MultiVariateTimeSeriesData | SpectrogramData
    ) -> SpectrogramData:
        if isinstance(data, SpectrogramData):
            return data

        if not isinstance(data, MultiVariateTimeSeriesData):
            raise RuntimeError(f"Unsupported data type: {type(data)}")

        if self.params.signal_name not in data.values:
            raise RuntimeError("Signal name not found in data")

        ts_data = data.values[self.params.signal_name]
        if ts_data is None:
            raise RuntimeError(
                f"Time series for {self.params.signal_name} does not exist."
            )

        return self.convert_timeseries_to_spectrogram(ts_data)

    def convert_timeseries_to_spectrogram(
        self, data: TimeSeriesData
    ) -> SpectrogramData:
        time = np.array(data.time)
        values = np.array(data.values)

        # Compute the Short-Time Fourier Transform (STFT)
        freq, time, values = compute_stft(data)

        # Clip to time/frequency range
        time_min = (
            self.params.time_min if self.params.time_min is not None else time.min()
        )
        time_max = (
            self.params.time_max if self.params.time_max is not None else time.max()
        )

        frequency_min = (
            self.params.frequency_min
            if self.params.frequency_min is not None
            else freq.min()
        )
        frequency_max = (
            self.params.frequency_max
            if self.params.frequency_max is not None
            else freq.max()
        )

        amplitude_min = (
            self.params.amplitude_min
            if self.params.amplitude_min is not None
            else values.min()
        )
        amplitude_max = (
            self.params.amplitude_max
            if self.params.amplitude_max is not None
            else values.max()
        )

        ds = xr.DataArray(values, coords=dict(frequency=freq, time=time))
        ds = ds.sel(time=slice(time_min, time_max))
        ds = ds.sel(frequency=slice(frequency_min, frequency_max))
        ds = ds.clip(amplitude_min, amplitude_max)

        return SpectrogramData(
            time=ds.time.values.tolist(),
            frequency=ds.frequency.values.tolist(),
            amplitude=ds.values.tolist(),
        )


DATA_VIEWS = {
    ViewType.IDENTITY: IdentityView,
    ViewType.SPECTROGRAM: SpectrogramView,
}
