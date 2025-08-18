import services.api.core.annotators as annotators
import pytest
import numpy
import math
from services.api.schemas.data import TimeSeriesData, MultiVariateTimeSeriesData
from services.api.schemas.annotators import FindPeaksParams

def test_find_peaks():
    # Create data with clear peaks above noise
    data = numpy.random.uniform(0, 10, 100)
    data[20] = 200
    data[40] = 400
    data[60] = 600
    data[80] = 800
    
    ts_data = TimeSeriesData(time=numpy.arange(100), values=data)
    mv_data = MultiVariateTimeSeriesData(values={"Ip": ts_data})
    
    params = FindPeaksParams(signal_name = "Ip", prominence=10, distance=10)
    annotator = annotators.FindPeaksAnnotator(params)
    time_regions = annotator.predict(mv_data)
    
    assert len(time_regions) == 4
    
    for i in range(4):
        assert (time_regions[i].time_min < 20*(i+1)) and (time_regions[i].time_max > 20*(i+1))
        
        # Check midpoint between time_min and time_max is roughly location of the peak
        time_mid = (time_regions[i].time_min + time_regions[i].time_max) / 2
        assert math.isclose(time_mid, 20*(i+1))
    
def test_find_peaks_params():
    # Create data with clear peaks above noise
    data = numpy.random.uniform(0, 10, 100)
    data[5] = 1000
    data[30] = 500
    data[35] = 500
    data[40] = 500
    data[60] = 300
    data[80] = 100
    data[95] = 1000
    
    ts_data = TimeSeriesData(time=numpy.arange(100), values=data)
    mv_data = MultiVariateTimeSeriesData(values={"Ip": ts_data})
    
    small_params = FindPeaksParams(signal_name="Ip", prominence=50, distance=1)
    # Create an annotator with the above params - this should detect all 7 peaks
    full_annotator = annotators.FindPeaksAnnotator(small_params)
    time_regions = full_annotator.predict(mv_data)
    assert len(time_regions) == 7
    
    # Then create an annotator with more limiting params
    params = FindPeaksParams(signal_name = "Ip", prominence=200, distance=10, time_min=10, time_max=90)
    annotator = annotators.FindPeaksAnnotator(params)
    time_regions = annotator.predict(mv_data)
    
    # Based on data above with these params:
    #   - Should recognise peaks at idx 30, 35, 40 as one peak since they are within 'distance'
    #   - Should find peak at idx 60
    #   - Should not find peak at idx 80 since this is below 'prominence'
    #   - Should not find peak at idx 5 since this is before 'time_min'
    #   - Should not find peak at idx 95 since this is beyond 'time_max'
    assert len(time_regions) == 2
    
    assert time_regions[0].time_min < 30 and  time_regions[1].time_min > 40
    time_mid = (time_regions[0].time_min + time_regions[0].time_max) / 2
    assert math.isclose(time_mid, 35, abs_tol=1)

    
    assert time_regions[0].time_min < 60 and  time_regions[1].time_min > 60
    time_mid = (time_regions[0].time_min + time_regions[0].time_max) / 2
    assert math.isclose(time_mid, 60)
    
    
    
    