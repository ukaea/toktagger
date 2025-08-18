import services.api.core.data_loaders as data_loaders
import pytest
from services.api.schemas.samples import Sample, ImageFileData, TimeSeriesFileData, ShotData
from services.api.schemas.data import (
    Data,
    MultiVariateTimeSeriesData,
    TimeSeriesData,
    ImageData,
)
import pathlib
import numpy

@pytest.mark.asyncio
async def test_image_file_loader_jpg():
    img_file = ImageFileData(file_name=str(pathlib.Path(__file__).parents[2].joinpath("MAST-U.jpg")), type="jpg", protocol="file", frame=1, time=0.1)
    sample = Sample(shot_id=10000, data=img_file, _id="test", project_id="test")
    data_loader = data_loaders.ImageDataLoader()
    image_data = data_loader.get_sample(sample)
    assert isinstance(image_data, ImageData)
    assert numpy.array(image_data.data).shape == (1079, 881, 3)

@pytest.mark.asyncio
async def test_image_file_loader_png():
    img_file = ImageFileData(file_name=str(pathlib.Path(__file__).parents[2].joinpath("MAST-U.png")), type="png", protocol="file", frame=1, time=0.1)
    sample = Sample(shot_id=10000, data=img_file, _id="test", project_id="test")
    data_loader = data_loaders.ImageDataLoader()
    image_data = data_loader.get_sample(sample)
    assert isinstance(image_data, ImageData)
    assert numpy.array(image_data.data).shape == (1079, 881, 3)
    
    
@pytest.mark.asyncio
async def test_parquet_file_loader():
    parquet_file = TimeSeriesFileData(file_name=str(pathlib.Path(__file__).parents[2].joinpath("test.parquet")), type="parquet", protocol="file", column_names=["Ip", "dalpha"])
    sample = Sample(shot_id=10000, data=parquet_file, _id="test", project_id="test")
    data_loader = data_loaders.ParquetDataLoader()
    data = data_loader.get_sample(sample)
    assert isinstance(data, MultiVariateTimeSeriesData)
    
    # Check both columns requested are present
    assert data.values.get("Ip")
    assert data.values.get("dalpha")

    # Check values - dalpha should be between 0 and 50
    dalpha_values = numpy.array(data.values.get("dalpha").values)
    ip_values = numpy.array(data.values.get("Ip").values)
    assert numpy.all((dalpha_values >= 0) & (dalpha_values <= 50))
    
    # Ip should have 4 values of 1000
    assert len(numpy.where(numpy.isclose(ip_values, 1000))[0]) == 4
    
@pytest.mark.asyncio
async def test_uda_loader():
    uda_shot = ShotData(protocol="uda", signal_names=["Ip", "dalpha"])
    sample = Sample(shot_id=10000, data=uda_shot, _id="test", project_id="test")
    data_loader = data_loaders.UDADataLoader()
    data = data_loader.get_sample(sample)
    assert isinstance(data, MultiVariateTimeSeriesData)
    import pdb; pdb.set_trace()
    
    # Check both columns requested are present
    assert data.values.get("Ip")
    assert data.values.get("dalpha")
    
    # TODO: Fix? Check values? Add check for uda connection before running test?
    