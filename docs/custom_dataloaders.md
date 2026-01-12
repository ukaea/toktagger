# Custom Data Loaders

Data loaders are the bridge between your data sources and TokTagger's annotation interface. They define how to retrieve and format data for visualization and annotation. TokTagger comes with built-in loaders for common formats (images, Parquet files, UDA), but you can easily create custom loaders for your specific data sources.

## Overview

A data loader is responsible for:

1. **Defining the expected sample data format** (e.g., shot IDs with signal names, file paths)
2. **Retrieving the actual data** from your data source
3. **Converting the data** into TokTagger's standardized format for visualization

## Creating a Custom Data Loader

### Step 1: Import Required Components

```python
from toktagger import DataLoader, LoaderRegistry
from toktagger.api.schemas.data import Data, MultiVariateTimeSeriesData, TimeSeriesData
from toktagger.api.schemas.samples import ShotData, FileData, TimeSeriesFileData
from typing import Type
import pydantic
```

### Step 2: Define Your Data Loader Class

Create a class that inherits from `DataLoader` and implement the required methods:

```python
@LoaderRegistry.register("my_custom_loader")
class MyCustomLoader(DataLoader):
    """DataLoader for retrieving data from my custom data source"""
    
    def __init__(self, params):
        # Initialize your data source connection here
        # For example: database connection, API client, etc.
        super().__init__(params)
    
    @classmethod
    def sample_data_type(cls) -> Type[ShotData | FileData | TimeSeriesFileData]:
        """Define what type of sample data this loader expects"""
        return ShotData  # or FileData, or TimeSeriesFileData
    
    @pydantic.validate_call
    def get_sample(self, shot_id: int, sample_data: ShotData) -> Data:
        """
        Retrieve and return data for a specific sample.
        
        Args:
            shot_id: Unique identifier for the sample
            sample_data: Sample-specific configuration (signal names, file paths, etc.)
            
        Returns:
            Data object in TokTagger format
        """
        # Your implementation here
        pass
```

### Step 3: Register the Loader

The `@LoaderRegistry.register("my_custom_loader")` decorator automatically registers your loader with TokTagger. The name you provide becomes the identifier used in project configurations.

### Step 4: Install Your Custom Loader

Create a Python package with your custom loader and install it in your environment:

```python
# my_loader_package/__init__.py
from my_loader_package.loader import MyCustomLoader

# Importing this package will automatically register the loader
```

Then install it:

```bash
pip install -e /path/to/my_loader_package
```

## Complete Example: CSV Time Series Loader

Here's a complete example of a custom loader for CSV time series files:

```python
import pandas as pd
import pathlib
from typing import Type
import pydantic

from toktagger import DataLoader, LoaderRegistry
from toktagger.api.schemas.data import MultiVariateTimeSeriesData, TimeSeriesData
from toktagger.api.schemas.samples import TimeSeriesFileData


@LoaderRegistry.register("csv_timeseries")
class CSVTimeSeriesLoader(DataLoader):
    """DataLoader for retrieving time series data from CSV files"""
    
    @classmethod
    def sample_data_type(cls) -> Type[TimeSeriesFileData]:
        # This loader expects file paths with optional signal names
        return TimeSeriesFileData
    
    @pydantic.validate_call
    def get_sample(
        self, 
        shot_id: int, 
        sample_data: TimeSeriesFileData
    ) -> MultiVariateTimeSeriesData:
        """
        Load time series data from a CSV file.
        
        Expected CSV format:
        - First column: time values
        - Remaining columns: signal values with column headers
        """
        # Verify file exists
        file_path = pathlib.Path(sample_data.file_name)
        if not file_path.exists():
            raise FileNotFoundError(
                f"Could not find CSV file at '{file_path}'"
            )
        
        # Read CSV file
        df = pd.read_csv(file_path, index_col=0)  # First column is time
        
        # Filter to requested signals if specified
        if sample_data.signal_names:
            df = df[sample_data.signal_names]
        
        # Handle missing values
        df = df.fillna(0)
        
        # Extract time values from index
        time = df.index.values.tolist()
        
        # Convert each column to TimeSeriesData format
        results = {}
        for column_name in df.columns:
            results[column_name] = TimeSeriesData(
                time=time,
                values=df[column_name].values.tolist()
            )
        
        return MultiVariateTimeSeriesData(values=results)
```

## Example: Database Loader

Here's an example of loading data from a SQL database:

```python
import sqlalchemy as sa
from typing import Type
import pydantic

from toktagger import DataLoader, LoaderRegistry
from toktagger.api.schemas.data import MultiVariateTimeSeriesData, TimeSeriesData
from toktagger.api.schemas.samples import ShotData


@LoaderRegistry.register("sql_database")
class SQLDatabaseLoader(DataLoader):
    """DataLoader for retrieving data from a SQL database"""
    
    def __init__(self, params):
        # Initialize database connection
        # Connection string should be in environment variable
        import os
        connection_string = os.environ.get("DATABASE_URL")
        self.engine = sa.create_engine(connection_string)
        super().__init__(params)
    
    @classmethod
    def sample_data_type(cls) -> Type[ShotData]:
        return ShotData
    
    @pydantic.validate_call
    def get_sample(
        self, 
        shot_id: int, 
        sample_data: ShotData
    ) -> MultiVariateTimeSeriesData:
        """Load time series data from database"""
        results = {}
        
        with self.engine.connect() as conn:
            for signal_name in sample_data.signal_names:
                # Query time series data for this shot and signal
                query = sa.text("""
                    SELECT time, value 
                    FROM timeseries_data 
                    WHERE shot_id = :shot_id AND signal_name = :signal_name
                    ORDER BY time
                """)
                
                result = conn.execute(
                    query, 
                    {"shot_id": shot_id, "signal_name": signal_name}
                )
                rows = result.fetchall()
                
                if rows:
                    time = [row[0] for row in rows]
                    values = [row[1] for row in rows]
                    results[signal_name] = TimeSeriesData(time=time, values=values)
                else:
                    results[signal_name] = None
        
        return MultiVariateTimeSeriesData(values=results)
```

## Data Types and Schemas

### Sample Data Types

Choose the appropriate sample data type for your loader:

#### `ShotData`
For shot-based data sources (like UDA, databases):

```python
class ShotData(BaseModel):
    protocol: ShotProtocol  # e.g., "uda", "sal"
    signal_names: list[str]  # List of signals to retrieve
```

**Use when**: Data is identified by shot number and signal names.

#### `FileData`
For file-based data sources (images, videos):

```python
class FileData(BaseModel):
    file_name: str  # Path to file or directory
    type: FileType  # e.g., "png", "jpg", "mp4"
    protocol: FileProtocol  # "file" or "s3"
```

**Use when**: Data is stored in individual files with different types.

#### `TimeSeriesFileData`
For time series files (Parquet, CSV, NetCDF):

```python
class TimeSeriesFileData(FileData):
    signal_names: Optional[list[str]] = None  # Optional signal filter
```

**Use when**: Files contain time series data with multiple signals.

### Return Data Types

Your `get_sample()` method should return one of these data types:

#### `ImageData`
For image-based visualization:

```python
class ImageData(Data):
    frame: int  # Frame number or identifier
    values: str  # Base64-encoded image string
```

#### `TimeSeriesData`
For single signal time series:

```python
class TimeSeriesData(Data):
    time: list[float]  # Time values
    values: list[float]  # Signal values
```

#### `MultiVariateTimeSeriesData`
For multiple signals (most common for fusion diagnostics):

```python
class MultiVariateTimeSeriesData(Data):
    values: dict[str, TimeSeriesData | None]  # Signal name -> data
```

#### `SpectrogramData`
For frequency-time representations:

```python
class SpectrogramData(Data):
    time: list[float]
    frequency: list[float]
    amplitude: list[list[float]]  # 2D array
```

## Using Your Custom Loader

### 1. Create a Project with Your Loader

```python
import requests

project = {
    "name": "My Custom Project",
    "task": "time-series",
    "query_strategy": "random",
    "data_loader": "my_custom_loader"  # Your loader's registered name
}

response = requests.post(
    "http://localhost:8002/projects",
    json=project
)
project_id = response.json()["_id"]
```

### 2. Add Samples Using Your Loader

For shot-based loaders:

```python
samples = [
    {
        "shot_id": 12345,
        "data": {
            "signal_names": ["ip", "dalpha", "temperature"],
            "protocol": "custom"
        }
    }
]

requests.post(
    f"http://localhost:8002/projects/{project_id}/samples",
    json=samples
)
```

For file-based loaders:

```python
samples = [
    {
        "shot_id": 12345,
        "data": {
            "file_name": "/path/to/data/12345.csv",
            "type": "csv",
            "protocol": "file",
            "signal_names": ["ip", "dalpha"]
        }
    }
]

requests.post(
    f"http://localhost:8002/projects/{project_id}/samples",
    json=samples
)
```