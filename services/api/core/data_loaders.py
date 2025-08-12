import sys
import types
import os
import s3fs
import pandas as pd
import pathlib
from abc import ABC, abstractmethod
from PIL import Image
import numpy as np
from services.api.schemas.data import (
    Data,
    MultiVariateTimeSeriesData,
    TimeSeriesData,
    ImageData,
)
from services.api.schemas.samples import FileData, Sample, ShotData, TimeSeriesFileData
from services.api.schemas.projects import DataLoaderType


# Toksearch specific patch
# Create a Fake MDS plus module to avoid the need to install MDSPlus on the system.
mds = types.ModuleType("MDSplus")
mds.Connection = None
sys.modules["MDSplus"] = mds


class DataLoader(ABC):
    @abstractmethod
    def get_sample(self, sample: Sample) -> Data:
        pass


class ImageDataLoader(DataLoader):
    """DataLoader for retrieving data using a folder of image files"""

    def get_sample(self, sample: Sample) -> ImageData:
        item: FileData = sample.data
        if not pathlib.Path(item.file_name).exists():
            raise FileNotFoundError(
                f"Could not find file at '{item.file_name}', relative to {pathlib.Path().cwd()}"
            )
        im = Image.open(item.file_name)
        arr = np.asarray(im)
        return ImageData(data=arr.tolist())


class ParquetDataLoader(DataLoader):
    """DataLoader for retrieving data using a folder of Parquet files"""

    def get_sample(self, sample: Sample) -> MultiVariateTimeSeriesData:
        item: TimeSeriesFileData = sample.data
        if not pathlib.Path(item.file_name).exists():
            raise FileNotFoundError(
                f"Could not find file at '{item.file_name}', relative to {pathlib.Path().cwd()}"
            )
        df = pd.read_parquet(item.file_name, columns=item.column_names)
        df = df.fillna(0)
        data = df.to_dict("list")
        time = df.index.values
        results = {}
        for key, value in data.items():
            results[key] = TimeSeriesData(time=time, values=value)

        return MultiVariateTimeSeriesData(values=results)


class UDADataLoader(DataLoader):
    """DataLoader for retrieving data using the UDA access layer"""

    def __init__(self):
        import pyuda

        self.client = pyuda.Client()

    def get_sample(self, sample: Sample) -> MultiVariateTimeSeriesData:
        item: ShotData = sample.data

        results = {}
        for name in item.signal_names:
            try:
                signal = self.client.get(name, sample.shot_id)
                data = signal.data
                time = signal.time.data
                item = TimeSeriesData(time=time, values=data)
                results[name] = item
            except Exception:
                results[name] = None

        return MultiVariateTimeSeriesData(values=results)


class SALDataLoader(DataLoader):
    """DataLoader for retrieving data using the SAL access layer"""

    def __init__(self):
        from sal.client import SALClient

        host = os.environ.get("SAL_HOST", "https://sal.jetdata.eu")
        self.client = SALClient(host)
        self.base_path = "s3://mast/level2/shots/"

    def get_sample(self, sample: Sample) -> MultiVariateTimeSeriesData:
        item: ShotData = sample.data

        results = {}
        for name in item.signal_names:
            name = f"/pulse/{sample.shot_id}/{name}"
            signal = self.client.get(name)
            data = signal.data
            time = signal.dimensions[0].data
            item = TimeSeriesData(time=time, values=data)
            results[name] = item

        return MultiVariateTimeSeriesData(values=results)


class TokSearchDataLoader(DataLoader):
    def __init__(self):
        super().__init__()
        self.endpoint = "https://echo.stfc.ac.uk"
        self.base_path = "s3://mast/level2/shots/"
        self.fs = s3fs.S3FileSystem(
            anon=True, endpoint_url=self.endpoint, asynchronous=True
        )

    def get_sample(self, sample: Sample) -> MultiVariateTimeSeriesData:
        item: ShotData = sample.data

        from toksearch.signal.zarr import ZarrSignal

        results = {}
        for name in item.signal_names:
            signal = ZarrSignal(self.base_path, name, fs=self.fs)
            ds = signal.fetch_as_xarray(sample.shot_id)
            data = ds.data
            time = ds.times.data
            item = TimeSeriesData(time=time, values=data)
            results[name] = item

        return MultiVariateTimeSeriesData(values=results)


DATA_LOADERS = {
    DataLoaderType.PARQUET: ParquetDataLoader,
    DataLoaderType.IMAGE: ImageDataLoader,
    DataLoaderType.UDA: UDADataLoader,
    DataLoaderType.SAL: SALDataLoader,
    DataLoaderType.TOKSEARCH: TokSearchDataLoader,
}
