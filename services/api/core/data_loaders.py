import pandas as pd
#import pyuda
from abc import ABC, abstractmethod
import PIL
import numpy as np
from services.api.schemas.data import MultiVariateTimeSeriesData, ImageData
from services.api.schemas.samples import FileData, Sample, ShotData
from services.api.schemas.projects import DataLoaderType

class DataLoader(ABC):
    @abstractmethod
    def __len__(self) -> int:
        pass

    @abstractmethod
    def __getitem__(self, index):
        pass


class ImageDataLoader(DataLoader):
    """DataLoader for retrieving data using a folder of image files"""

    def __init__(self, samples: list[Sample]):
        self.data_items: list[FileData] = [sample.data for sample in samples]

    def __len__(self) -> int:
        return len(self.data_items)

    def __getitem__(self, index) -> MultiVariateTimeSeriesData:
        item: FileData = self.data_items[index]
        im = PIL.Image.open(item.file_name)
        arr = np.asarray(im)
        return ImageData(arr.tolist())
    
    def get_sample(self, sample: Sample):
        item: FileData = sample.data
        im = PIL.Image.open(item.file_name)
        arr = np.asarray(im)
        return ImageData(arr.tolist())

class ParquetDataLoader(DataLoader):
    """DataLoader for retrieving data using a folder of Parquet files"""

    def __init__(self, samples: list[Sample]):
        self.data_items: list[FileData] = [sample.data for sample in samples]

    def __len__(self) -> int:
        return len(self.data_items)

    def __getitem__(self, index) -> MultiVariateTimeSeriesData:
        item: FileData = self.data_items[index]
        df = pd.read_parquet(item.file_name)
        df = df[item.column_names]
        data = df.to_dict("records")
        time = df.index.values
        return MultiVariateTimeSeriesData(time=time, values=data)


class UDADataLoader(DataLoader):
    """DataLoader for retrieving data using the UDA access layer"""
    pass

    # def __init__(self, samples: list[Sample]):
    #     self.client = pyuda.Client()
    #     self.data_items: list[ShotData] = [sample.data for sample in samples]

    # def __len__(self) -> int:
    #     return len(self.data_items)

    # def __getitem__(self, index):
    #     item: ShotData = self.data_items[index]

    #     results = {}
    #     for name in item.signal_names:
    #         signal = self.client.get(item.shot_id, name)
    #         results[name] = signal.data
    #         time = signal.time.data

    #     return MultiVariateTimeSeriesData(time=time, values=results)

DATA_LOADERS = {
    DataLoaderType.PARQUET: ParquetDataLoader,
    DataLoaderType.UDA: UDADataLoader,
    DataLoaderType.IMAGE: ImageDataLoader
}