import services.api.core.annotators as annotators
import numpy
import math
from scipy.datasets import electrocardiogram
from services.api.schemas.data import TimeSeriesData, MultiVariateTimeSeriesData
from services.api.schemas.annotators import PeakDetectionParams


def test_find_peaks():
    data = electrocardiogram()[2000:4000]
    ts_data = TimeSeriesData(time=numpy.arange(len(data)), values=data)
    mv_data = MultiVariateTimeSeriesData(values={"Ip": ts_data})

    params = PeakDetectionParams(signal_name="Ip", prominence=1, distance=1)
    annotator = annotators.PeakDetectionAnnotator(params)
    time_regions = annotator.predict(mv_data)

    assert len(time_regions) == 12
    for region in time_regions:
        assert region.time_min < region.time_max
        assert region.time_min >= 0
        assert region.time_max <= len(data)

def test_find_peaks_params():
    data = electrocardiogram()[2000:4000]
    ts_data = TimeSeriesData(time=numpy.arange(len(data)), values=data)
    mv_data = MultiVariateTimeSeriesData(values={"Ip": ts_data})

    small_params = PeakDetectionParams(signal_name="Ip", prominence=1, distance=1)
    # Create an annotator with the above params - this should detect all 7 peaks
    full_annotator = annotators.PeakDetectionAnnotator(small_params)
    time_regions = full_annotator.predict(mv_data)
    assert len(time_regions) == 12

    # Then create an annotator with more limiting params
    params = PeakDetectionParams(
        signal_name="Ip", prominence=1, distance=100, time_min=10, time_max=500
    )
    annotator = annotators.PeakDetectionAnnotator(params)
    time_regions = annotator.predict(mv_data)

    assert len(time_regions) == 3

    peak = time_regions[0]
    assert numpy.isclose(peak.time_min, 51, rtol=1e-1)
    assert numpy.isclose(peak.time_max, 85, rtol=1e-1)

    peak = time_regions[1]
    assert numpy.isclose(peak.time_min, 228, rtol=1e-1)
    assert numpy.isclose(peak.time_max, 273, rtol=1e-1)
