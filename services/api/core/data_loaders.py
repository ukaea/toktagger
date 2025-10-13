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
    DataParamTypes,
)
from services.api.schemas.samples import FileData, Sample, ShotData, TimeSeriesFileData
from services.api.schemas.projects import DataLoaderType


class DataLoader(ABC):
    def __init__(self, params: DataParamTypes):
        self.params = params

    @abstractmethod
    def get_sample(self, sample: Sample) -> Data:
        pass


class ImageDataLoader(DataLoader):
    """DataLoader for retrieving data using a folder of image files"""

    def get_sample(self, sample: Sample) -> ImageData:
        item: FileData = sample.data
        # Find directory of images
        dir_path = pathlib.Path(item.file_name)
        if not dir_path.exists() or not dir_path.is_dir():
            raise FileNotFoundError(
                f"Could not find directory at '{dir_path}', relative to {pathlib.Path().cwd()}"
            )
        # Open image which represents frame selected
        file_path = dir_path.joinpath(f"{self.params.frame}.{item.type}")
        if not file_path.exists():
            raise FileNotFoundError(
                f"Could not find image file at '{file_path}', relative to {pathlib.Path().cwd()}"
            )
        im = Image.open(file_path)
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

        super().__init__()

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


DATA_LOADERS = {
    DataLoaderType.PARQUET: ParquetDataLoader,
    DataLoaderType.UDA: UDADataLoader,
    DataLoaderType.IMAGE: ImageDataLoader,
}
