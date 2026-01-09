import os
import pathlib
from abc import ABC, abstractmethod
from typing import Optional

import numpy as np
import pandas as pd
from PIL import Image

from toktagger.api.schemas.data import (
    Data,
    ImageData,
    MultiVariateTimeSeriesData,
    TimeSeriesData,
)
from toktagger.api.schemas.samples import FileData, Sample, ShotData, TimeSeriesFileData

# Set up UDA environment variables with defaults if not already set. This is required for
# the pyuda client to work correctly outside of Freia.
os.environ["UDA_HOST"] = os.environ.get("UDA_HOST", "uda2.mast.l")
os.environ["UDA_META_PLUGINNAME"] = os.environ.get("UDA_META_PLUGINNAME", "MASTU_DB")
os.environ["UDA_METANEW_PLUGINNAME"] = os.environ.get(
    "UDA_METANEW_PLUGINNAME", "MAST_DB"
)


class DataLoaderError(Exception):
    """Custom exception for data loader errors."""

    pass


class DataLoader(ABC):
    @abstractmethod
    def get_sample(self, sample: Sample, **kwargs) -> Data:
        pass


class LoaderRegistry:
    _registry: dict[str, DataLoader] = {}

    @classmethod
    def register(cls, name: str):
        def decorator(loader_class: DataLoader):
            if not issubclass(loader_class, DataLoader):
                raise ValueError(
                    f"Loader '{name}' does not inherit from DataLoader base class."
                )
            cls._registry[name] = loader_class
            return loader_class

        return decorator

    @classmethod
    def get(cls, name: str):
        loader_class: DataLoader | None = cls._registry.get(name)
        if not loader_class:
            raise ValueError(f"No DataLoader class called '{name}' found in registry!")
        return loader_class

    @classmethod
    def names(cls):
        return list(cls._registry.keys())


@LoaderRegistry.register("image")
class ImageDataLoader(DataLoader):
    """DataLoader for retrieving data using a folder of image files"""

    def get_sample(self, sample: Sample, **kwargs) -> ImageData:
        assert isinstance(sample.data, FileData)
        item: FileData = sample.data
        if not pathlib.Path(item.file_name).exists():
            raise FileNotFoundError(
                f"Could not find file at '{item.file_name}', relative to {pathlib.Path().cwd()}"
            )
        im = Image.open(item.file_name)
        arr = np.asarray(im)
        return ImageData(data=arr.tolist())


@LoaderRegistry.register("parquet")
class ParquetDataLoader(DataLoader):
    """DataLoader for retrieving data using a folder of Parquet files"""

    def get_sample(
        self,
        sample: Sample,
        time_min: Optional[float] = None,
        time_max: Optional[float] = None,
        **kwargs,
    ) -> MultiVariateTimeSeriesData:
        assert isinstance(sample.data, TimeSeriesFileData)
        item: TimeSeriesFileData = sample.data
        if not pathlib.Path(item.file_name).exists():
            raise FileNotFoundError(
                f"Could not find file at '{item.file_name}', relative to {pathlib.Path().cwd()}"
            )
        df = pd.read_parquet(item.file_name, columns=item.column_names)
        df = df.fillna(0)

        if time_min is not None:
            df = df[df.index >= time_min]

        if time_max is not None:
            df = df[df.index <= time_max]

        time = df.index.values

        data = df.to_dict("list")
        results = {}
        for key, value in data.items():
            results[key] = TimeSeriesData(time=time, values=value)

        return MultiVariateTimeSeriesData(values=results)


@LoaderRegistry.register("uda")
class UDADataLoader(DataLoader):
    """DataLoader for retrieving data using the UDA access layer"""

    def __init__(self):
        import pyuda

        self.client = pyuda.Client()

    def get_sample(
        self,
        sample: Sample,
        time_min: Optional[float] = None,
        time_max: Optional[float] = None,
        **kwargs,
    ) -> MultiVariateTimeSeriesData:
        assert isinstance(sample.data, ShotData)
        item: ShotData = sample.data

        results = {}
        for name in item.signal_names:
            try:
                signal = self.client.get(name, sample.shot_id)
                data = signal.data
                time = signal.time.data

                if time_min is not None:
                    mask = time >= time_min
                    time = time[mask]
                    data = data[mask]

                if time_max is not None:
                    mask = time <= time_max
                    time = time[mask]
                    data = data[mask]

                item = TimeSeriesData(time=time, values=data)
                results[name] = item
            except Exception:
                results[name] = None

        if all(values is None for values in results.values()):
            raise DataLoaderError(
                f"Could not load any signals for shot ID '{sample.shot_id}'. Check UDA connectivity and signal names."
            )

        return MultiVariateTimeSeriesData(values=results)
