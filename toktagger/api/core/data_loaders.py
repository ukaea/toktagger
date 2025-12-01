import os
import pandas as pd
import pathlib
from abc import ABC, abstractmethod
from PIL import Image
import io
import base64
from toktagger.api.schemas.data import (
    Data,
    MultiVariateTimeSeriesData,
    TimeSeriesData,
    ImageData,
    DataParamTypes,
)
from toktagger.api.schemas.samples import FileData, Sample, ShotData, TimeSeriesFileData


# Set up UDA environment variables with defaults if not already set. This is required for
# the pyuda client to work correctly outside of Freia.
os.environ["UDA_HOST"] = os.environ.get("UDA_HOST", "uda2.mast.l")
os.environ["UDA_META_PLUGINNAME"] = os.environ.get("UDA_META_PLUGINNAME", "MASTU_DB")
os.environ["UDA_METANEW_PLUGINNAME"] = os.environ.get(
    "UDA_METANEW_PLUGINNAME", "MAST_DB"
)


class DataLoader(ABC):
    def __init__(self, params: DataParamTypes):
        self.params = params

    @abstractmethod
    def get_sample(self, sample: Sample) -> Data:
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

    def __init__(self, params: DataParamTypes):
        super().__init__(params)

    def get_sample(self, sample: Sample) -> ImageData:
        assert isinstance(sample.data, FileData)
        item: FileData = sample.data
        # Find directory of images
        dir_path = pathlib.Path(item.file_name)
        if not dir_path.exists() or not dir_path.is_dir():
            raise FileNotFoundError(
                f"Could not find directory at '{dir_path}', relative to {pathlib.Path().cwd()} - {list(pathlib.Path().cwd().iterdir())}"
            )
        # Open image which represents frame selected
        if self.params.name != "image":  # TODO do we want this?
            file_path = next(dir_path.iterdir())
        else:
            file_path = dir_path.joinpath(f"{self.params.frame}.{item.type}")
        if not file_path.exists():
            raise FileNotFoundError(
                f"Could not find image file at '{file_path}', relative to {pathlib.Path().cwd()}"
            )
        im = Image.open(file_path)
        buffer = io.BytesIO()
        im.save(buffer, format="PNG")
        buffer.seek(0)

        return ImageData(
            frame=file_path.name.split(".")[0],
            values=base64.b64encode(buffer.getvalue()).decode(),
        )


@LoaderRegistry.register("parquet")
class ParquetDataLoader(DataLoader):
    """DataLoader for retrieving data using a folder of Parquet files"""

    def get_sample(self, sample: Sample) -> MultiVariateTimeSeriesData:
        assert isinstance(sample.data, TimeSeriesFileData)
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


@LoaderRegistry.register("uda")
class UDADataLoader(DataLoader):
    """DataLoader for retrieving data using the UDA access layer"""

    def __init__(self):
        import pyuda

        self.client = pyuda.Client()

        super().__init__()

    def get_sample(self, sample: Sample) -> MultiVariateTimeSeriesData:
        assert isinstance(sample.data, ShotData)
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
