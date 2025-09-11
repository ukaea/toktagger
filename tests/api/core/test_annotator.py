import services.api.core.annotators as annotators
import numpy
import math
from scipy.datasets import electrocardiogram
from services.common.schemas.annotations import SpectrogramMask
from services.common.schemas.data import TimeSeriesData, MultiVariateTimeSeriesData
from services.common.schemas.annotators import FindPeaksParams, SpectrogramThresholdParams


def test_find_peaks():
    # Create data with clear peaks above noise
    data = numpy.random.uniform(0, 10, 100)
    data[20] = 200
    data[40] = 400
    data[60] = 600
    data[80] = 800

    ts_data = TimeSeriesData(time=numpy.arange(100), values=data)
    mv_data = MultiVariateTimeSeriesData(values={"Ip": ts_data})

    params = FindPeaksParams(signal_name="Ip", prominence=10, distance=10)
    annotator = annotators.FindPeaksAnnotator(params)
    time_regions = annotator.predict(mv_data)

    assert len(time_regions) == 4

    for i in range(4):
        assert (time_regions[i].time_min < 20 * (i + 1)) and (
            time_regions[i].time_max > 20 * (i + 1)
        )

        # Check midpoint between time_min and time_max is roughly location of the peak
        time_mid = (time_regions[i].time_min + time_regions[i].time_max) / 2
        assert math.isclose(time_mid, 20 * (i + 1))


def test_find_peaks_params():
    data = electrocardiogram()[2000:4000]
    ts_data = TimeSeriesData(time=numpy.arange(len(data)), values=data)
    mv_data = MultiVariateTimeSeriesData(values={"Ip": ts_data})

    small_params = FindPeaksParams(signal_name="Ip", prominence=1, distance=1)
    # Create an annotator with the above params - this should detect all 7 peaks
    full_annotator = annotators.FindPeaksAnnotator(small_params)
    time_regions = full_annotator.predict(mv_data)
    assert len(time_regions) == 12

    # Then create an annotator with more limiting params
    params = FindPeaksParams(
        signal_name="Ip", prominence=1, distance=100, time_min=10, time_max=500
    )
    annotator = annotators.FindPeaksAnnotator(params)
    time_regions = annotator.predict(mv_data)

    assert len(time_regions) == 3

    peak = time_regions[0]
    assert numpy.isclose(peak.time_min, 44, rtol=1e-1)
    assert numpy.isclose(peak.time_max, 85, rtol=1e-1)

    peak = time_regions[1]
    assert numpy.isclose(peak.time_min, 228, rtol=1e-1)
    assert numpy.isclose(peak.time_max, 273, rtol=1e-1)


def test_spectrogram_threshold():
    data = electrocardiogram()[2000:4000]
    ts_data = TimeSeriesData(time=numpy.arange(len(data)), values=data)
    mv_data = MultiVariateTimeSeriesData(values={"Ip": ts_data})

    params = SpectrogramThresholdParams(signal_name="Ip", percentile=95)
    annotator = annotators.SpectrogramThresholdAnnotator(params)
    result = annotator.predict(mv_data)

    assert isinstance(result, SpectrogramMask)
    mask = numpy.array(result.values)
    assert mask.shape == (129, 17)
    assert mask.min() == 0
    assert mask.max() == 1
