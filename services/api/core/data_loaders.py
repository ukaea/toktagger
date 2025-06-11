import pandas as pd

from abc import ABC, abstractmethod
from PIL import Image
import numpy as np
from services.api.schemas.data import Data, MultiVariateTimeSeriesData, ImageData
from services.api.schemas.samples import FileData, Sample, ShotData
from services.api.schemas.projects import DataLoaderType


class DataLoader(ABC):
    @abstractmethod
    def get_sample(self, sample: Sample) -> Data:
        pass


class ImageDataLoader(DataLoader):
    """DataLoader for retrieving data using a folder of image files"""

    def get_sample(self, sample: Sample) -> ImageData:
        item: FileData = sample.data
        im = Image.open(item.file_name).resize(
            (20, 10)
        )  # TODO: Get rid of this temp resizing
        arr = np.asarray(im)
        return ImageData(data=arr.tolist())


class ParquetDataLoader(DataLoader):
    """DataLoader for retrieving data using a folder of Parquet files"""

    def get_sample(self, sample: Sample) -> MultiVariateTimeSeriesData:
        item: FileData = sample.data
        df = pd.read_parquet(item.file_name)
        # df = df[item.column_names]
        df = df.fillna(0)
        data = df.to_dict("list")
        time = df.index.values
        return MultiVariateTimeSeriesData(time=time, values=data)


class UDADataLoader(DataLoader):
    """DataLoader for retrieving data using the UDA access layer"""

    def __init__(self):
        import pyuda

        self.client = pyuda.Client()

    def get_sample(self, sample: Sample) -> MultiVariateTimeSeriesData:
        item: ShotData = sample.data

        results = {}
        for name in item.signal_names:
            signal = self.client.get(name, sample.shot_id)
            results[name] = signal.data
            time = signal.time.data

        return MultiVariateTimeSeriesData(time=time, values=results)


DATA_LOADERS = {
    DataLoaderType.PARQUET: ParquetDataLoader,
    DataLoaderType.UDA: UDADataLoader,
    DataLoaderType.IMAGE: ImageDataLoader,
}
