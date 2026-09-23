# Python Client

TokTagger ships with a Python client (`toktagger.client`) for pulling labelled data from a running TokTagger server programmatically, without going through the UI. You can fetch projects, samples, sample data (time series, images, 2D profiles) and annotations, and convert them straight into pandas, xarray and numpy objects — handy for building ML pipelines or doing offline analysis on your labelled datasets.

The client is **read-only**: it fetches data but cannot create or modify projects, samples or annotations.

## Installation

The client is included in the standard `toktagger` package, so no extra install is needed:

```sh
pip install toktagger
```

You need a TokTagger server to connect to, running by default at `http://localhost:8002`.

## Getting Started

```python
from toktagger.client import TokTaggerClient

with TokTaggerClient("http://localhost:8002") as client:
    # Check the server is reachable and its database is connected
    client.health()

    # Fetch a project
    project = client.get_project_by_name("MST example")
    print(project.task, project.data_loader)

    # List a few samples in the project
    for sample in project.list_samples(count=10):
        print(sample.shot_id)
```

Use the client as a context manager so the underlying HTTP connection is closed when the `with` block exits. If your server runs elsewhere, pass the address as `base_url` (a per-request `timeout` in seconds can also be set).

Every project and sample returned by the client has the client bound to it, so you can chain lookups without passing IDs around:

```python
with TokTaggerClient() as client:
    project = client.get_project_by_name("MST example")
    sample = project.get_sample_by_shot_id(100000)
    data = sample.get_data()
    annotations = sample.list_annotations(validated=True)
```

The same calls also work in flat form, passing the IDs explicitly — both styles return identical results:

```python
sample = client.get_sample(project.id, sample.id)
data = client.get_data(project.id, sample.id)
annotations = client.list_annotations(project.id, sample_id=sample.id)
```

## Fetching Projects and Samples

| Method | Description |
|---|---|
| `client.list_projects(name=None, start=0, count=100, ...)` | List projects; `name` filters by case-insensitive substring |
| `client.get_project(project_id)` | Fetch one project by ID |
| `client.get_project_by_name(name)` | Fetch the project with this name; raises `NotFoundError` if nothing matches and `MultipleResultsFoundError` if several do (name is a substring match, so several projects can match) |
| `client.list_samples(project_id, shot_id=None, ...)` | List a project's samples, optionally filtered by shot ID |
| `client.get_sample(project_id, sample_id)` | Fetch one sample by ID |
| `client.get_sample_by_shot_id(project_id, shot_id)` | Fetch the sample with this shot ID; raises if zero or several samples match |
| `client.get_samples_summary(project_id)` | Aggregated statistics over the project's samples (e.g. counts per annotation type) |

The list methods support pagination with `start` (results to skip) and `count` (max results, default 100), and sorting with `sort_by` / `sort_direction` (default: most recent first).

## Fetching Sample Data

`get_data()` returns a sample's data the same way the UI requests it, and accepts the same data loader and view parameters:

```python
from toktagger.client import TokTaggerClient
from toktagger.api.schemas.data import ImageParams
from toktagger.api.schemas.views import Profile2DViewParams

with TokTaggerClient() as client:
    # Default parameters: raw data, as configured by the project's data loader
    data = client.get_data(project_id, sample_id)

    # A single frame of video data
    frame = client.get_data(project_id, sample_id, params=ImageParams(frame=0))

    # A 2D profile view of one signal
    profile = client.get_data(
        project_id, sample_id, view=Profile2DViewParams(signal_name="Ip")
    )
```

The response is parsed into its concrete type, e.g. `TimeSeriesData`, `MultiVariateTimeSeriesData`, `Profile2DData`, `MultiProfile2DData` or `ImageData`. Which parameters are valid depends on the project's [data loader](./data_loaders.md) and labelling view, e.g. `ImageParams(frame=...)` for [video](./video.md)/image projects and `Profile2DViewParams(signal_name=...)` for [2D profile](./profile_2d.md) projects.

## Fetching Annotations

`list_annotations()` returns a project's annotations (or one sample's), parsed into their concrete types — e.g. `TimeRegion`, `TimePoint`, `VideoBoundingBox` — rather than raw dictionaries:

```python
with TokTaggerClient() as client:
    # All annotations in the project
    annotations = client.list_annotations(project_id)

    # Only validated annotations, most recent first
    annotations = client.list_annotations(project_id, validated=True, count=1000)

    # One sample's annotations, restricted to a specific annotator
    # (a model name, or "manual")
    annotations = sample.list_annotations(created_by="manual")
```

Filters: `validated` (validation status) and `created_by` (annotator; sample level only), plus the usual `start` / `count` / `sort_by` / `sort_direction` pagination arguments.

## Converting to pandas, xarray and numpy

The client ships conversion helpers that turn fetched data into standard analysis containers:

| Helper | Input | Returns |
|---|---|---|
| `annotations_to_dataframe(annotations)` | list of annotations | `DataFrame` with one row per annotation; a column is created for every field present on any annotation, with NaN where a row lacks it, so mixed annotation types aggregate into one frame |
| `timeseries_to_dataframe(data)` | `TimeSeriesData` or `MultiVariateTimeSeriesData` | `DataFrame` indexed by `time` with one column per signal |
| `profile2d_to_xarray(profile)` | `Profile2DData` or `MultiProfile2DData` | xarray `Dataset` with one variable per profile, dims `(time, dim_1)` and both coordinate axes attached |
| `image_to_array(data)` | `ImageData` | decoded pixel `ndarray`: `(H, W)` grayscale, `(H, W, 3)` RGB, `(H, W, 4)` RGBA |
| `extract_data(data)` | anything `get_data()` can return | dispatches on the type: `DataFrame` for time series, `Dataset` for profiles, `ndarray` for images |

```python
from toktagger.client import (
    TokTaggerClient,
    annotations_to_dataframe,
    extract_data,
    timeseries_to_dataframe,
)
from toktagger.api.schemas.data import ImageParams

with TokTaggerClient() as client:
    # One DataFrame across all of a project's annotations
    df = annotations_to_dataframe(
        client.list_annotations(project_id, count=1000)
    )

    # Convert whatever get_data() returned, without checking the type
    result = extract_data(client.get_data(project_id, sample_id))  # DataFrame

    # Or target a specific container directly
    ts = timeseries_to_dataframe(sample.get_data())  # DataFrame, time-indexed
    frame = image_to_array(
        client.get_data(project_id, sample_id, params=ImageParams(frame=0))
    )  # ndarray
```

The helpers are pure conversions — they make no network calls. Fetch with the client first, then convert.

## Error Handling

All client errors derive from `TokTaggerClientError`, so you can catch them all at once or handle the specific cases:

| Exception | Raised when |
|---|---|
| `TokTaggerClientError` | the server cannot be reached, or another client-side error |
| `TokTaggerAPIError` | the API returns a non-2xx response; has `status_code` and `detail` attributes |
| `NotFoundError` | a 404 response, or a by-name / by-shot-ID lookup that matched nothing |
| `MultipleResultsFoundError` | a by-name / by-shot-ID lookup matched more than one record |

```python
from toktagger.client import TokTaggerClient
from toktagger.client.exceptions import MultipleResultsFoundError, NotFoundError

try:
    project = client.get_project_by_name(name)
except MultipleResultsFoundError:
    # Show the matches and let the user pick one
    for candidate in client.list_projects(name=name):
        print(candidate.id, candidate.name)
except NotFoundError:
    print(f"No project matching '{name}'")
```