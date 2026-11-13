import pathlib

import pandas as pd
import pytest

from tests import db_definitions
from toktagger.api.schemas.annotations import TimeRegion
from toktagger.api.schemas.data import MultiVariateTimeSeriesData
from toktagger.api.schemas.projects import ProjectUpdate
from toktagger.api.schemas.samples import SampleSummary, SampleUpdate
from toktagger.client.schemas import Project, Sample, TimeRegionOut
from toktagger.client.exceptions import (
    NotFoundError,
)

# Valid ObjectId format but absent from the server database
MISSING_OBJECT_ID = "0" * 24


def test_update_project(integration_toktagger_client, seeded_project_with_samples):
    project_id, sample_ids, _ = seeded_project_with_samples
    project = integration_toktagger_client.get_project(project_id)

    updated_project = project.update(ProjectUpdate(name="updated_project"))

    assert isinstance(updated_project, Project)
    assert updated_project._client is integration_toktagger_client
    assert updated_project.model_dump() == {
        **project.model_dump(),
        "name": "updated_project",
    }
    assert project.name == "seeded_project_with_samples"
    stored_project = integration_toktagger_client.get_project(project_id)
    assert stored_project.model_dump() == updated_project.model_dump()
    assert sorted(sample.id for sample in updated_project.list_samples()) == sorted(
        sample_ids
    )


def test_list_samples(integration_toktagger_client, seeded_project_with_samples):
    project_id, sample_ids, _ = seeded_project_with_samples
    project = integration_toktagger_client.get_project(project_id)
    samples = project.list_samples()
    assert sorted(s.id for s in samples) == sorted(sample_ids)
    assert all(isinstance(s, Sample) for s in samples)
    assert all(s._client is integration_toktagger_client for s in samples)


def test_list_samples_shot_id_filter(
    integration_toktagger_client, seeded_project_with_samples
):
    project_id, _, _ = seeded_project_with_samples
    project = integration_toktagger_client.get_project(project_id)
    samples = project.list_samples(shot_id=10000)
    assert len(samples) == 1
    assert samples[0].shot_id == 10000


def test_create_sample(integration_toktagger_client, seeded_project_with_samples):
    project_id, sample_ids, _ = seeded_project_with_samples
    project = integration_toktagger_client.get_project(project_id)

    sample = project.create_sample(db_definitions.SAMPLE_4)

    assert isinstance(sample, Sample)
    assert sample._client is integration_toktagger_client
    assert sample.project_id == project_id
    assert sample.shot_id == db_definitions.SAMPLE_4.shot_id
    assert sample.data == db_definitions.SAMPLE_4.data
    assert sorted(result.id for result in project.list_samples()) == sorted(
        [*sample_ids, sample.id]
    )
    data = sample.get_data()
    assert isinstance(data, MultiVariateTimeSeriesData)
    expected_data = pd.read_parquet(db_definitions.SAMPLE_4.data.file_name)
    assert data.values["Ip"].values == expected_data.Ip.tolist()


def test_update_sample(integration_toktagger_client, seeded_project_with_samples):
    project_id, sample_ids, _ = seeded_project_with_samples
    sample = integration_toktagger_client.get_sample(project_id, sample_ids[0])

    updated_sample = sample.update(
        SampleUpdate(validated_annotations=not sample.validated_annotations)
    )

    assert isinstance(updated_sample, Sample)
    assert updated_sample._client is integration_toktagger_client
    assert updated_sample.model_dump() == {
        **sample.model_dump(),
        "validated_annotations": not sample.validated_annotations,
    }
    assert updated_sample is not sample
    stored_sample = integration_toktagger_client.get_sample(project_id, sample.id)
    assert stored_sample.model_dump() == updated_sample.model_dump()
    assert isinstance(updated_sample.get_data(), MultiVariateTimeSeriesData)


def test_get_sample(integration_toktagger_client, seeded_project_with_samples):
    project_id, sample_ids, _ = seeded_project_with_samples
    project = integration_toktagger_client.get_project(project_id)
    sample = project.get_sample(sample_ids[0])
    assert isinstance(sample, Sample)
    assert sample.id == sample_ids[0]
    assert sample.project_id == project_id
    assert sample._client is integration_toktagger_client


def test_get_sample_by_shot_id(
    integration_toktagger_client, seeded_project_with_samples
):
    project_id, _, _ = seeded_project_with_samples
    project = integration_toktagger_client.get_project(project_id)
    sample = project.get_sample_by_shot_id(10001)
    assert sample.shot_id == 10001
    assert sample.project_id == project_id
    assert sample._client is integration_toktagger_client


def test_get_sample_by_shot_id_missing(
    integration_toktagger_client, seeded_project_with_samples
):
    project_id, _, _ = seeded_project_with_samples
    project = integration_toktagger_client.get_project(project_id)
    with pytest.raises(NotFoundError) as exc_info:
        project.get_sample_by_shot_id(99999)
    assert exc_info.value.status_code is None


def test_get_samples_summary(integration_toktagger_client, seeded_project_with_samples):
    project_id, _, _ = seeded_project_with_samples
    project = integration_toktagger_client.get_project(project_id)
    summary = project.get_samples_summary()
    assert isinstance(summary, SampleSummary)
    assert summary.total == 2
    assert summary.shot_min == 10000
    assert summary.shot_max == 10001


def test_get_data(integration_toktagger_client, seeded_project_with_samples):
    project_id, sample_ids, _ = seeded_project_with_samples
    project = integration_toktagger_client.get_project(project_id)
    sample = project.get_sample(sample_ids[0])
    data = sample.get_data()

    # The tabular loader returns one TimeSeriesData per requested signal
    assert isinstance(data, MultiVariateTimeSeriesData)
    assert set(data.values.keys()) == {"Ip"}
    assert data.values["Ip"].time == list(range(100))
    # Values match the underlying parquet file
    df = pd.read_parquet(pathlib.Path(__file__).parents[2] / "10000.parquet")
    assert data.values["Ip"].values == df.Ip.tolist()


def test_get_sample_missing_sample_raises_not_found(
    integration_toktagger_client, seeded_project_with_samples
):
    project_id, _, _ = seeded_project_with_samples
    project = integration_toktagger_client.get_project(project_id)
    with pytest.raises(NotFoundError) as exc_info:
        project.get_sample(MISSING_OBJECT_ID)
    assert exc_info.value.status_code == 404


def test_create_annotations(integration_toktagger_client, seeded_project_with_samples):
    project_id, sample_ids, _ = seeded_project_with_samples
    sample = integration_toktagger_client.get_sample(project_id, sample_ids[0])

    annotations = sample.list_annotations()
    assert len(annotations) == 2

    annotation = TimeRegion(
        label=db_definitions.ANNOTATION_1.label,
        time_min=db_definitions.ANNOTATION_1.time_min,
        time_max=db_definitions.ANNOTATION_1.time_max,
    )

    annotation_ids = sample.create_annotations([annotation])

    assert len(annotation_ids) == 1
    annotations = sample.list_annotations()
    assert len(annotations) == 3
    created = next(
        annotation for annotation in annotations if annotation.id == annotation_ids[0]
    )
    assert created.sample_id == sample.id
    assert created.label == db_definitions.ANNOTATION_1.label
    assert created.time_min == db_definitions.ANNOTATION_1.time_min
    assert created.time_max == db_definitions.ANNOTATION_1.time_max


def test_get_annotation(integration_toktagger_client, seeded_project_with_samples):
    project_id, sample_ids, annotation_ids = seeded_project_with_samples
    project = integration_toktagger_client.get_project(project_id)
    sample = project.get_sample(sample_ids[0])

    assert len(annotation_ids) == 2
    for annotation_id in annotation_ids:
        annotation = sample.get_annotation(annotation_id)

        assert isinstance(annotation, TimeRegionOut)
        assert annotation.id == annotation_id
        assert annotation.project_id == project_id
        assert annotation.sample_id == sample.id
        assert annotation._client is integration_toktagger_client


def test_update_annotation(integration_toktagger_client, seeded_project_with_samples):
    project_id, sample_ids, _ = seeded_project_with_samples
    sample = integration_toktagger_client.get_sample(project_id, sample_ids[0])
    original = sample.list_annotations()[0]

    updated = original.update(TimeRegion(label="corrected", time_min=0.5, time_max=0.6))

    assert updated.id == original.id
    assert updated._client is integration_toktagger_client
    assert updated.created_by == original.created_by
    assert updated.label == "corrected"
    assert original.label == "Ramp Up"
    assert len(sample.list_annotations()) == 2
    saved_again = updated.update(
        TimeRegion(label="reviewed", time_min=0.5, time_max=0.7)
    )
    assert saved_again.id == original.id
    assert saved_again.label == "reviewed"


def test_list_annotations_project_level(
    integration_toktagger_client, seeded_project_with_samples
):
    project_id, sample_ids, _ = seeded_project_with_samples
    project = integration_toktagger_client.get_project(project_id)
    annotations = project.list_annotations()

    assert len(annotations) == 3
    # Parsed into concrete annotation types, not raw dicts
    assert all(isinstance(a, TimeRegion) for a in annotations)
    assert all(a.project_id == project_id for a in annotations)
    # Two from sample_ids[0], one from sample_ids[1]
    assert sum(a.sample_id == sample_ids[0] for a in annotations) == 2
    assert sum(a.sample_id == sample_ids[1] for a in annotations) == 1


def test_list_annotations_sample_level(
    integration_toktagger_client, seeded_project_with_samples
):
    project_id, sample_ids, _ = seeded_project_with_samples
    project = integration_toktagger_client.get_project(project_id)
    sample = project.get_sample(sample_ids[0])

    annotations = sample.list_annotations()
    assert len(annotations) == 2
    assert all(isinstance(a, TimeRegion) for a in annotations)
    assert all(a.project_id == project_id for a in annotations)


def test_list_annotations_sample_level_filters(
    integration_toktagger_client, seeded_project_with_samples
):
    project_id, sample_ids, _ = seeded_project_with_samples
    project = integration_toktagger_client.get_project(project_id)
    sample = project.get_sample(sample_ids[0])

    annotations = sample.list_annotations()
    assert len(annotations) == 2

    annotations = sample.list_annotations(validated=True)
    assert len(annotations) == 1
    assert annotations[0].label == "Flat Top"

    annotations = sample.list_annotations(validated=False)
    assert len(annotations) == 1
    assert annotations[0].label == "Ramp Up"


def test_list_annotations_missing_sample_raises_not_found(
    integration_toktagger_client, seeded_project_with_samples
):
    project_id, sample_ids, _ = seeded_project_with_samples
    project = integration_toktagger_client.get_project(project_id)
    sample = project.get_sample(sample_ids[0])
    # Point the sample at an ID the server does not know
    sample.id = MISSING_OBJECT_ID
    with pytest.raises(NotFoundError) as exc_info:
        sample.list_annotations()
    assert exc_info.value.status_code == 404
