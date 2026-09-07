import pathlib

import pandas as pd
import pytest
from toktagger.api.schemas.annotations import TimeRegion
from toktagger.api.schemas.data import MultiVariateTimeSeriesData
from toktagger.api.schemas.samples import SampleSummary
from toktagger.client.client import (
    Sample,
)
from toktagger.client.exceptions import (
    NotFoundError,
)

# Valid ObjectId format but absent from the server database
MISSING_OBJECT_ID = "0" * 24


def test_list_samples(client, seeded_project_with_samples):
    project_id, sample_ids = seeded_project_with_samples
    project = client.get_project(project_id)
    samples = project.list_samples()
    assert sorted(s.id for s in samples) == sorted(sample_ids)
    assert all(isinstance(s, Sample) for s in samples)
    assert all(s._client is client for s in samples)


def test_list_samples_shot_id_filter(client, seeded_project_with_samples):
    project_id, _ = seeded_project_with_samples
    project = client.get_project(project_id)
    samples = project.list_samples(shot_id=10000)
    assert len(samples) == 1
    assert samples[0].shot_id == 10000


def test_get_sample(client, seeded_project_with_samples):
    project_id, sample_ids = seeded_project_with_samples
    project = client.get_project(project_id)
    sample = project.get_sample(sample_ids[0])
    assert isinstance(sample, Sample)
    assert sample.id == sample_ids[0]
    assert sample.project_id == project_id
    assert sample._client is client


def test_get_sample_by_shot_id(client, seeded_project_with_samples):
    project_id, _ = seeded_project_with_samples
    project = client.get_project(project_id)
    sample = project.get_sample_by_shot_id(10001)
    assert sample.shot_id == 10001
    assert sample.project_id == project_id
    assert sample._client is client


def test_get_sample_by_shot_id_missing(client, seeded_project_with_samples):
    project_id, _ = seeded_project_with_samples
    project = client.get_project(project_id)
    with pytest.raises(NotFoundError) as exc_info:
        project.get_sample_by_shot_id(99999)
    assert exc_info.value.status_code is None


def test_get_samples_summary(client, seeded_project_with_samples):
    project_id, _ = seeded_project_with_samples
    project = client.get_project(project_id)
    summary = project.get_samples_summary()
    assert isinstance(summary, SampleSummary)
    assert summary.total == 2
    assert summary.shot_min == 10000
    assert summary.shot_max == 10001


def test_get_data(client, seeded_project_with_samples):
    project_id, sample_ids = seeded_project_with_samples
    project = client.get_project(project_id)
    sample = project.get_sample(sample_ids[0])
    data = sample.get_data()

    # The tabular loader returns one TimeSeriesData per requested signal
    assert isinstance(data, MultiVariateTimeSeriesData)
    assert set(data.values.keys()) == {"Ip"}
    assert data.values["Ip"].time == list(range(100))
    # Values match the underlying parquet file
    df = pd.read_parquet(pathlib.Path(__file__).parents[2] / "10000.parquet")
    assert data.values["Ip"].values == df.Ip.tolist()


def test_get_data_missing_sample_raises_not_found(client, seeded_project_with_samples):
    project_id, _ = seeded_project_with_samples
    project = client.get_project(project_id)
    with pytest.raises(NotFoundError) as exc_info:
        project.get_data(MISSING_OBJECT_ID)
    assert exc_info.value.status_code == 404


def test_list_annotations_project_level(client, seeded_project_with_samples):
    project_id, sample_ids = seeded_project_with_samples
    project = client.get_project(project_id)
    annotations = project.list_annotations()

    assert len(annotations) == 3
    # Parsed into concrete annotation types, not raw dicts
    assert all(isinstance(a, TimeRegion) for a in annotations)
    assert all(a.project_id == project_id for a in annotations)
    # Two from sample_ids[0], one from sample_ids[1]
    assert sum(a.sample_id == sample_ids[0] for a in annotations) == 2
    assert sum(a.sample_id == sample_ids[1] for a in annotations) == 1


def test_list_annotations_sample_level(client, seeded_project_with_samples):
    project_id, sample_ids = seeded_project_with_samples
    project = client.get_project(project_id)
    sample = project.get_sample(sample_ids[0])

    annotations = sample.list_annotations()
    assert len(annotations) == 2
    assert all(isinstance(a, TimeRegion) for a in annotations)
    assert all(a.project_id == project_id for a in annotations)


def test_list_annotations_sample_level_filters(client, seeded_project_with_samples):
    project_id, sample_ids = seeded_project_with_samples
    project = client.get_project(project_id)
    sample = project.get_sample(sample_ids[0])

    annotations = sample.list_annotations(created_by="manual")
    assert len(annotations) == 1
    assert annotations[0].label == "Flat Top"
    assert annotations[0].created_by == "manual"
    assert annotations[0].validated is True

    annotations = sample.list_annotations(validated=True)
    assert len(annotations) == 1
    assert annotations[0].label == "Flat Top"

    annotations = sample.list_annotations(validated=False)
    assert len(annotations) == 1
    assert annotations[0].label == "Ramp Up"
    assert annotations[0].created_by == "peak_detection"


def test_list_annotations_missing_sample_raises_not_found(
    client, seeded_project_with_samples
):
    project_id, sample_ids = seeded_project_with_samples
    project = client.get_project(project_id)
    sample = project.get_sample(sample_ids[0])
    # Point the sample at an ID the server does not know
    sample.id = MISSING_OBJECT_ID
    with pytest.raises(NotFoundError) as exc_info:
        sample.list_annotations()
    assert exc_info.value.status_code == 404
