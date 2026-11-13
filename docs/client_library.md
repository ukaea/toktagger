# Python Client

TokTagger ships with a Python client (`toktagger.client`) for pulling labelled data from a running TokTagger server programmatically, without going through the UI. You can fetch projects, samples, sample data (time series, images, 2D profiles) and annotations, and convert them straight into pandas, xarray and numpy objects — handy for building ML pipelines or doing offline analysis on your labelled datasets.

The client can create and update projects, samples and annotations, include initial annotations when creating samples, and fetch data.

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

Every project, sample and annotation returned by the client has the client bound to it, so you can chain operations without passing IDs around:

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

## Creating Projects

Pass the existing `ProjectIn` schema to `create_project()`:

```python
from toktagger.api.schemas.projects import ProjectIn, QueryStrategyType, Task
from toktagger.client import TokTaggerClient

with TokTaggerClient() as client:
    project = client.create_project(
        ProjectIn(
            name="Disruption Detection",
            task=Task.TIME_SERIES,
            data_loader="tabular",
            query_strategy=QueryStrategyType.SEQUENTIAL,
            time_min=0.0,
            time_max=1.0,
            time_region_labels=["Flat Top", "Ramp Up"],
        )
    )
    print(project.id)
    samples = project.list_samples()  # Initially empty
```

Set `TOKTAGGER_API_TOKEN` or pass `api_token` when constructing the client. The creator becomes a project admin.

`ProjectIn` validates the configuration and supplies the same defaults as the API. Unlike the returned `Project`, it does not require an ID. Using a schema also keeps label and time settings in one place rather than duplicating them as method parameters; the trade-off is the extra import and schema construction.

The method posts the configuration, then fetches the stored project using the returned ID. The result supports the same chained lookups as other client methods. API and connection errors use the normal client exceptions. If the follow-up fetch fails, the project may already have been created; check before retrying to avoid duplicates.

## Updating Projects

Use `ProjectUpdate` to change only the fields you specify:

```python
from toktagger.api.schemas.projects import ProjectUpdate, QueryStrategyType

project = client.update_project(
    project_id,
    ProjectUpdate(name="New name", query_strategy=QueryStrategyType.SEQUENTIAL),
)

# The same operation using a client-bound project:
project = project.update(ProjectUpdate(time_min=0.0, time_region_labels=[]))
```

Both methods return a freshly fetched, client-bound `Project`. `project.update()` does not change the original local object; assign its return value to keep your local reference current.

Unspecified fields remain unchanged. The backend also ignores `None` values; they do not clear existing settings. An empty label list (`[]`) does clear that label list. Task and data loader cannot be changed through `ProjectUpdate`. Updating requires project-admin or global-admin permissions.

As with creation, updating is followed by a GET request. If that fetch fails, the update may already have been saved.

## Creating Samples

Pass a `SampleIn` to `client.create_sample(project_id, sample)` or `project.create_sample(sample)`:

```python
from toktagger.api.schemas.samples import SampleIn, TimeSeriesFileData

sample = project.create_sample(
    SampleIn(
        shot_id=10000,
        data=TimeSeriesFileData(
            file_name="/data/10000.parquet",
            type="parquet",
            signal_names=["Ip"],
        ),
    )
)
data = sample.get_data()
```

The data source must match the project's loader, and file paths refer to files accessible to the server, not the client machine. Remote sources use `ShotData`; image sources use `ImageFileData` or `ImageArrayFileData`.

`SampleIn.annotations` optionally supplies initial batch annotations. The backend derives `validated_annotations` from them and attributes human annotations to the authenticated caller. Sample creation requires project-admin or global-admin permissions.

Both methods return a freshly fetched, client-bound `Sample`, supporting chained data and annotation lookups. The client sends a one-item list to the API's bulk-create endpoint, then fetches the new sample by its returned ID. If that fetch fails, the sample may already exist; check before retrying to avoid duplicates.

## Updating Samples

Use `SampleUpdate` to change a sample's validation status:

```python
from toktagger.api.schemas.samples import SampleUpdate

sample = client.update_sample(
    project_id, sample_id, SampleUpdate(validated_annotations=True)
)

# The same operation using a client-bound sample:
sample = sample.update(SampleUpdate(validated_annotations=False))
```

Both methods return a freshly fetched, client-bound `Sample`; `sample.update()` does not mutate the original local instance. Unspecified fields and `None` values are left unchanged. `False` explicitly clears the sample's validation flag. This does not change individual annotations or their validation status. Shot ID and data source are not editable through `SampleUpdate`.

Updating requires annotator or admin access to the project, or global-admin permissions. The client checks that the sample belongs to the project before sending a one-item batch update, then fetches the saved sample. If the final fetch fails, the update may already have been saved.

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

## Creating Annotations

Use `sample.create_annotations(annotations)` or `client.create_annotations(project_id, sample_id, annotations)` to append new annotations to one sample without replacing existing ones:

```python
from toktagger.api.schemas.annotations import TimeRegion

annotation_ids = sample.create_annotations([
    TimeRegion(
        label="Flat Top",
        time_min=0.2,
        time_max=0.4,
        validated=True,
    )
])

# Equivalent flat call:
annotation_ids = client.create_annotations(project_id, sample_id, [
    TimeRegion(label="Ramp Up", time_min=0.1, time_max=0.2)
])
```

Pass plain annotation schemas such as `TimeRegion`, `TimePoint`, or `VideoBoundingBox` (the `AnnotationTypes` union). `created_by` is optional; the server assigns human authorship. There is no need to supply shot, sample, or project IDs in the annotations: the server derives them from the target sample. Supplied annotation IDs are ignored; this always creates new records, never edits existing ones. Other samples are untouched, even if they share the same shot ID.

Both methods return the new annotation IDs in input order; use `sample.list_annotations()` to retrieve saved records. Human authorship is assigned to the authenticated caller, while registered machine authors are preserved. Creating requires project annotator/admin or global-admin access. Any validated annotation marks the sample validated; unvalidated additions do not clear its existing validation flag. An empty list returns `[]` and changes nothing.

The bound `Sample` is not refreshed or mutated by creation. Fetch it again to see its current validation flag. The operation is not transactional: if a request fails after writing begins, some annotations may already exist; check before retrying to avoid duplicates.

## Updating Annotations

Use `client.update_annotation(project_id, sample_id, annotation_id, annotation)` to update one annotation, or call `update()` on an annotation returned by `list_annotations()`:

```python
from toktagger.api.schemas.annotations import TimeRegion

annotation = sample.list_annotations()[0]  # A time region in this example
updated = annotation.update(
    TimeRegion(label="Flat Top", time_min=0.2, time_max=0.4, validated=True)
)

# Equivalent flat call:
updated = client.update_annotation(
    project_id,
    sample_id,
    annotation.id,
    TimeRegion(label="Flat Top", time_min=0.2, time_max=0.4, validated=True),
)
```

Supply the same annotation type, including its required label and geometry. Optional fields you omit, and explicit `None` values, remain unchanged. An annotation cannot change type. IDs, author, shot ID and creation timestamp are preserved, and other annotations on the sample are untouched. Updating requires project annotator/admin or global-admin access; annotators may correct another author's annotation without taking ownership.

Both forms return a freshly fetched concrete annotation with a bound client, so `updated.update(...)` also works. Returned annotations retain their concrete server schema type and also inherit the client `Annotation` base (`from toktagger.client.schemas import Annotation`). The original local instance is not mutated. A validated annotation has zero uncertainty. Only an update explicitly setting `validated=True` marks the sample validated; other updates leave the sample's existing validation flag unchanged.

The API update returns no updated schema. The client follows it with `get_annotation()` to retrieve the saved record, matching project and sample updates. If that fetch fails, the update may already have been saved; check before retrying.

The server returns 404 if the annotation does not belong to the specified project and sample.

## Fetching Annotations

Use `client.get_annotation(project_id, sample_id, annotation_id)` or `sample.get_annotation(annotation_id)` to retrieve a single annotation by ID. The result includes resolved author names and a bound client for `annotation.update(...)`. Missing or out-of-scope annotations raise `NotFoundError`. Direct-ID lookups ignore the annotation list preference; project access is still required.

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

Every data model returned by `get_data()` has a `to_processed()` method that converts it into a standard analysis container. The return type depends on the data type:

| Data type | `to_processed()` returns |
|---|---|
| `TimeSeriesData` | `DataFrame` indexed by `time` with one column named `values` (a single series has no signal name of its own) |
| `MultiVariateTimeSeriesData` | `DataFrame` indexed by `time` with one column per signal; signals whose value is None are skipped, and differing time arrays are aligned on their union (missing points become NaN) |
| `Profile2DData` | xarray `Dataset` with one variable named `values`, dims `(time, dim_1)` and both coordinate axes attached |
| `MultiProfile2DData` | xarray `Dataset` with one variable per profile; profiles whose value is None are skipped, and differing coordinates are aligned on their union (missing points become NaN) |
| `ImageData` | decoded pixel `ndarray`: `(H, W)` grayscale, `(H, W, 3)` RGB, `(H, W, 4)` RGBA |

`Profile2DData.values` has no fixed axis order: loaders emit `(time, dim_1)` while `Profile2DView` emits the transposed `(dim_1, time)` layout, so the axis order is inferred from the coordinate lengths. Square profiles are ambiguous and are assumed to be `(time, dim_1)`.

`to_processed()` raises `ValueError` for a bare `Data` instance (no payload), an `ImageData` whose encoded bytes cannot be decoded, or a profile whose values are inconsistent with its coordinate lengths.

Annotations are not data models, so they have a dedicated helper: `annotations_to_dataframe(annotations)` returns a `DataFrame` with one row per annotation; a column is created for every field present on any annotation, with NaN where a row lacks it, so mixed annotation types aggregate into one frame.

```python
from toktagger.client import TokTaggerClient, annotations_to_dataframe
from toktagger.api.schemas.data import ImageParams

with TokTaggerClient() as client:
    # Convert whatever get_data() returned, without checking the type
    result = client.get_data(project_id, sample_id).to_processed()  # DataFrame

    # A single video frame as a numpy array
    frame = client.get_data(
        project_id, sample_id, params=ImageParams(frame=0)
    ).to_processed()  # ndarray

    # One DataFrame across all of a project's annotations
    df = annotations_to_dataframe(client.list_annotations(project_id, count=1000))
```

The conversions are pure — they make no network calls. Fetch with the client first, then convert.

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