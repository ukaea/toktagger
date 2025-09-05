import pandas as pd
import json
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

import pathlib

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
        df = pd.read_parquet(item.file_name, columns=item.signal_names)
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
    
class JsonDataLoader(DataLoader):
    """DataLoader for retrieving data from a JSON file."""

    def get_sample(self, sample: Sample) -> MultiVariateTimeSeriesData:
        # Open the file which contains the data, getting the path from sample.data
        # TODO: TEMP FIX FOR WHEWN RUNNING LCALLY
        #with open(sample.data.file_name, "r") as json_file:
        with open(sample.data.file_name, "r") as json_file:
            # Load in the data, and extract only the data for the shot relevant to this sample
            shot_data = json.load(json_file)[str(sample.shot_id)]["data"]
        
        # For each signal name specified in the sample, extract the lists of times and values,
        # constructing an instance of TimeSeriesData for each one
        
        # Note from the schema that sample.data.signal_names can be None, which should include all signals
        signal_names = sample.data.signal_names if sample.data.signal_names else list(shot_data.keys())
        
        results = {
            signal_name: TimeSeriesData(
                time=shot_data[signal_name]["times"], 
                values=shot_data[signal_name]["values"]
                ) 
            for signal_name in signal_names
            }

        # Pass this correctly formatted dictionary of data into our MultiVariateTimeSeriesData schema
        return MultiVariateTimeSeriesData(values=results)
    

DATA_LOADERS = {
    DataLoaderType.PARQUET: ParquetDataLoader,
    DataLoaderType.UDA: UDADataLoader,
    DataLoaderType.IMAGE: ImageDataLoader,
    DataLoaderType.JSON: JsonDataLoader
}
