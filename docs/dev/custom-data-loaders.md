# Adding a Custom Data Loader
Viz Annotation comes with some common data loader backends by default, such as local files, UDA, TokSearch etc. However if the Tokamak which you wish to label data for has its own data retrieval system which is not currentyly supported by us, you can easily add your own data loaders!

## The DataLoader Class
To create your own data loader, it must inherit from the `DataLoader` base class. This class requires one method to be defined, `get_sample`, which accepts a `Sample` object as an input, and returns a `Data` object as an output. The structure of these objects may change depending on the type of labelling task you are doing - see full definitions in `viz-annotation.api.schemas.samples` and `viz-annotation.api.schemas.data`.

You can import the DataLoader class from the `viz-annotation` package with:
```python
from viz-annotation import DataLoader
```

## The LoaderRegistry
The loader registry keeps track of which types of data loaders are available to the server when trying to access data. You must decorate your data loader class with the `LoaderRegistry.register` method, providing a shorthand name which you wish to refer to your data loader by when creating projects. You can import this from the `viz-annotation` package with:
```python
from viz-annotation import LoaderRegistry
```

## Running the server
If you have added your own data loaders, you must make sure they have been loaded before the server is run. You can run the server from within a Python script by initializing the `Server` class, and running `server.run()`. For example, your script for adding a data loader and running the server may look like this:

```python
from viz_annotation import DataLoader, LoaderRegistry, Server
from viz-annotation.api.schemas.samples import Sample
from viz-annotation.api.schemas.data import TimeSeriesData

# Say we have a python module which can load data from our Tokamak's data backend:
import my_tokamak_data_backend

# Decorate your class using the Loader Registry, 
# providing a string which you want to refer to your data loader as:
@LoaderRegistry.register("my_tokamak")
class MyDataLoader(DataLoader):

    def get_sample(self, sample: Sample) -> TimeSeriesData:
        # Here you add the logic for how to obtain the data for your given sample
        loaded: dict = my_tokamak_data_backend.get(
            shot_id = sample.shot_id, 
            signal_name = sample.signal_names[0]
            )

        # Format it into the Data schema which you want to use
        # For example, if we are loading time series data:
        return TimeSeriesData(
            time=loaded["time"], 
            values=loaded["values"]
            )

# Create and run a server in the same file, 
# so that your data loader is correctly added to the registry:
server = Server()
server.run()
```