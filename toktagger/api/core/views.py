import numpy as np
import xarray as xr
from toktagger.api.core.annotators import compute_stft
from toktagger.api.schemas.data import (
    Profile2DData,
    MultiVariateTimeSeriesData,
    MultiProfile2DData,
    MultiSignalData,
    Data,
    RadialProfileData,
    TimeSeriesData,
)
from toktagger.api.schemas.views import (
    Profile2DViewParams,
    RadialProfileViewParams,
    ViewParams,
    ViewType,
)


class IdentityView:
    def __init__(self, params: ViewParams):
        self.params = params

    def __call__(self, data: Data):
        return data


class Profile2DView:
    def __init__(self, params: Profile2DViewParams):
        self.params = params

    def convert_profile_to_view(
        self, data: Profile2DData | TimeSeriesData
    ) -> Profile2DData:
        if isinstance(data, TimeSeriesData):
            dim_1, time, values = compute_stft(data)  # shape (dim_1, time)
        elif isinstance(data, Profile2DData):
            time = np.array(data.time)
            dim_1 = np.array(data.dim_1)
            values = np.array(data.values).T  # (time, dim_1) -> (dim_1, time)
        else:
            raise RuntimeError(f"Unsupported data type for Profile2DView: {type(data)}")

        # Clip to time/frequency range
        time_min = (
            self.params.time_min if self.params.time_min is not None else time.min()
        )
        time_max = (
            self.params.time_max if self.params.time_max is not None else time.max()
        )

        if (
            self.params.time_min is not None
            and self.params.time_max is not None
            and self.params.time_min == self.params.time_max
        ):
            raise RuntimeError("time_min and time_max must not be equal")

        dim_1_min = (
            self.params.dim_1_min if self.params.dim_1_min is not None else dim_1.min()
        )
        dim_1_max = (
            self.params.dim_1_max if self.params.dim_1_max is not None else dim_1.max()
        )

        values_min = (
            self.params.values_min
            if self.params.values_min is not None
            else np.nanmin(values)
        )
        values_max = (
            self.params.values_max
            if self.params.values_max is not None
            else np.nanmax(values)
        )

        ds = xr.DataArray(
            values, coords=dict(dim_1=dim_1, time=time), dims=["dim_1", "time"]
        )
        ds = ds.sel(time=slice(time_min, time_max))
        ds = ds.sel(dim_1=slice(dim_1_min, dim_1_max))
        ds = ds.clip(values_min, values_max)

        return Profile2DData(
            time=ds.time.values.tolist(),
            dim_1=ds.dim_1.values.tolist(),
            values=ds.values.tolist(),
        )

    def __call__(
        self, data: MultiProfile2DData | MultiVariateTimeSeriesData
    ) -> Profile2DData:
        if self.params.signal_name not in data.values:
            raise RuntimeError("Signal name not found in data")

        profile_data = data.values.get(self.params.signal_name, None)

        if profile_data is None:
            raise RuntimeError(
                f"Profile data for {self.params.signal_name} does not exist."
            )

        return self.convert_profile_to_view(profile_data)


def _finite_or_none(values: np.ndarray) -> list[list[float | None]]:
    """Convert a 2D array to nested lists, replacing NaN/inf with None for JSON."""
    return np.where(np.isfinite(values), values, None).tolist()


class RadialProfileView:
    def __init__(self, params: RadialProfileViewParams):
        self.params = params

    def __call__(
        self, data: MultiSignalData | MultiProfile2DData | MultiVariateTimeSeriesData
    ) -> RadialProfileData:
        profiles = {
            name: value
            for name, value in data.values.items()
            if isinstance(value, Profile2DData)
        }
        profile_signal = self.params.profile_signal or next(iter(profiles), None)
        if profile_signal is None:
            raise RuntimeError("No 2D profile signal found for radial profile view")
        if profile_signal not in profiles:
            raise RuntimeError(f"Profile data for {profile_signal} does not exist.")

        profile = profiles[profile_signal]
        values = np.array(profile.values, dtype=float)

        if self.params.radius_signal is None:
            radius = np.broadcast_to(np.array(profile.dim_1, dtype=float), values.shape)
        else:
            radius_data = profiles.get(self.params.radius_signal)
            if radius_data is None:
                raise RuntimeError(
                    f"Radius data for {self.params.radius_signal} does not exist."
                )
            radius = np.array(radius_data.values, dtype=float)
            if radius.shape != values.shape:
                raise RuntimeError(
                    f"Radius signal shape {radius.shape} does not match profile shape {values.shape}"
                )

        time_series = {
            name: value
            for name, value in data.values.items()
            if isinstance(value, TimeSeriesData)
        }

        return RadialProfileData(
            profile_signal=profile_signal,
            time=profile.time,
            radius=_finite_or_none(radius),
            values=_finite_or_none(values),
            time_series=time_series,
        )


DATA_VIEWS = {
    ViewType.IDENTITY: IdentityView,
    ViewType.PROFILE_2D: Profile2DView,
    ViewType.RADIAL_PROFILE: RadialProfileView,
}
