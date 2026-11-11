import pathlib

import pandas as pd
import pytest
from bson import ObjectId

import tests.db_definitions as db_definitions
from tests import endpoints
from toktagger.api.schemas.annotations import TimeRegion
from toktagger.api.schemas.data import MultiVariateTimeSeriesData
from toktagger.api.schemas.projects import ProjectUpdate, QueryStrategyType
from toktagger.api.schemas.samples import SampleSummary
from toktagger.client.client import (
    Project,
    Sample,
)
from toktagger.client.exceptions import (
    NotFoundError,
    MultipleResultsFoundError,
)

# Valid ObjectId format but absent from the server database
MISSING_OBJECT_ID = "0" * 24


def test_health(integration_toktagger_client):
    health = integration_toktagger_client.health()
    assert health["name"] == "TokTagger"
    assert health["db_connected"] is True
    assert health["testing_mode"] is True


def test_list_projects(
    integration_toktagger_client, seeded_project, seeded_project_with_samples
):
    projects = integration_toktagger_client.list_projects()
    ids = [p.id for p in projects]
    assert seeded_project_with_samples[0] in ids
    assert seeded_project[0] in ids
    assert all(isinstance(p, Project) for p in projects)
    assert all(p._client is integration_toktagger_client for p in projects)


def test_list_projects_name_filter(
    integration_toktagger_client, seeded_project, seeded_project_with_samples
):
    projects = integration_toktagger_client.list_projects(
        name="seeded_project_with_samples"
    )
    ids = [p.id for p in projects]
    assert seeded_project_with_samples[0] in ids
    assert seeded_project[0] not in ids


@pytest.mark.parametrize(
    "project_definition",
    [
        db_definitions.PROJECT_1,
        db_definitions.PROJECT_2,
        db_definitions.PROJECT_3,
    ],
    ids=["profile-2d", "time-series", "video"],
)
def test_create_project(integration_toktagger_client, project_definition):
    project = integration_toktagger_client.create_project(project_definition)

    assert isinstance(project, Project)
    assert ObjectId.is_valid(project.id)
    assert project._client is integration_toktagger_client
    assert project.model_dump(exclude={"id"}) == project_definition.model_dump()

    stored_project = integration_toktagger_client.get_project(project.id)
    assert stored_project.model_dump() == project.model_dump()
    assert project.id in [
        result.id for result in integration_toktagger_client.list_projects()
    ]
    assert project.list_samples() == []
    members = endpoints.get_project_members(project.id)
    assert len(members) == 1
    assert members[0]["role"] == "admin"


@pytest.mark.parametrize(
    "updates",
    [
        ProjectUpdate(
            name="updated_project", query_strategy=QueryStrategyType.SEQUENTIAL
        ),
        ProjectUpdate(time_min=0.0, time_max=1.5, min_time_step=0.001),
        ProjectUpdate(shot_labels=[], time_region_labels=["Flat Top"]),
        ProjectUpdate(),
        ProjectUpdate(name=None, time_min=None),
    ],
    ids=[
        "name-and-strategy",
        "time-window",
        "labels",
        "no-changes",
        "ignored-null-values",
    ],
)
def test_update_project(integration_toktagger_client, seeded_project, updates):
    project = integration_toktagger_client.get_project(seeded_project[0])

    updated_project = integration_toktagger_client.update_project(project.id, updates)

    assert isinstance(updated_project, Project)
    assert updated_project._client is integration_toktagger_client
    assert updated_project.model_dump() == {
        **project.model_dump(),
        **updates.model_dump(mode="json", exclude_unset=True, exclude_none=True),
    }
    stored_project = integration_toktagger_client.get_project(project.id)
    assert stored_project.model_dump() == updated_project.model_dump()
    assert updated_project.list_samples() == []


def test_update_project_missing(integration_toktagger_client):
    with pytest.raises(NotFoundError) as exc_info:
        integration_toktagger_client.update_project(
            MISSING_OBJECT_ID, ProjectUpdate(name="updated_project")
        )
    assert exc_info.value.status_code == 404


def test_get_project(integration_toktagger_client, seeded_project):
    project = integration_toktagger_client.get_project(seeded_project[0])
    assert isinstance(project, Project)
    assert project.id == seeded_project[0]
    assert project._client is integration_toktagger_client


def test_get_project_missing_raises_not_found(integration_toktagger_client):
    with pytest.raises(NotFoundError) as exc_info:
        integration_toktagger_client.get_project(MISSING_OBJECT_ID)
    assert exc_info.value.status_code == 404


def test_get_project_by_name(integration_toktagger_client, seeded_project_with_samples):
    project_id, _ = seeded_project_with_samples
    project = integration_toktagger_client.get_project_by_name(
        "seeded_project_with_samples"
    )
    assert project.id == project_id
    assert project._client is integration_toktagger_client


def test_get_project_by_name_missing(integration_toktagger_client):
    with pytest.raises(NotFoundError) as exc_info:
        integration_toktagger_client.get_project_by_name("toktagger-does-not-exist-xyz")
    # Client-side lookup error: no HTTP status code
    assert exc_info.value.status_code is None


def test_get_project_by_name_multiple(
    integration_toktagger_client, seeded_project, seeded_project_with_samples
):
    with pytest.raises(MultipleResultsFoundError):
        integration_toktagger_client.get_project_by_name("seeded")


def test_list_samples(integration_toktagger_client, seeded_project_with_samples):
    project_id, sample_ids = seeded_project_with_samples
    samples = integration_toktagger_client.list_samples(project_id)
    assert sorted(s.id for s in samples) == sorted(sample_ids)
    assert all(isinstance(s, Sample) for s in samples)
    assert all(s._client is integration_toktagger_client for s in samples)


def test_list_samples_shot_id_filter(
    integration_toktagger_client, seeded_project_with_samples
):
    project_id, _ = seeded_project_with_samples
    samples = integration_toktagger_client.list_samples(project_id, shot_id=10000)
    assert len(samples) == 1
    assert samples[0].shot_id == 10000


def test_get_sample(integration_toktagger_client, seeded_project_with_samples):
    project_id, sample_ids = seeded_project_with_samples
    sample = integration_toktagger_client.get_sample(project_id, sample_ids[0])
    assert isinstance(sample, Sample)
    assert sample.id == sample_ids[0]
    assert sample.project_id == project_id
    assert sample._client is integration_toktagger_client


def test_get_sample_by_shot_id(
    integration_toktagger_client, seeded_project_with_samples
):
    project_id, _ = seeded_project_with_samples
    sample = integration_toktagger_client.get_sample_by_shot_id(project_id, 10001)
    assert sample.shot_id == 10001
    assert sample.project_id == project_id
    assert sample._client is integration_toktagger_client


def test_get_sample_by_shot_id_missing(
    integration_toktagger_client, seeded_project_with_samples
):
    project_id, _ = seeded_project_with_samples
    with pytest.raises(NotFoundError) as exc_info:
        integration_toktagger_client.get_sample_by_shot_id(project_id, 99999)
    assert exc_info.value.status_code is None


def test_get_samples_summary(integration_toktagger_client, seeded_project_with_samples):
    project_id, _ = seeded_project_with_samples
    summary = integration_toktagger_client.get_samples_summary(project_id)
    assert isinstance(summary, SampleSummary)
    assert summary.total == 2
    assert summary.shot_min == 10000
    assert summary.shot_max == 10001


def test_get_data(integration_toktagger_client, seeded_project_with_samples):
    project_id, sample_ids = seeded_project_with_samples
    data = integration_toktagger_client.get_data(project_id, sample_ids[0])

    # The tabular loader returns one TimeSeriesData per requested signal
    assert isinstance(data, MultiVariateTimeSeriesData)
    assert set(data.values.keys()) == {"Ip"}
    assert data.values["Ip"].time == list(range(100))
    # Values match the underlying parquet file
    df = pd.read_parquet(pathlib.Path(__file__).parents[2] / "10000.parquet")
    assert data.values["Ip"].values == df.Ip.tolist()


def test_get_data_missing_sample_raises_not_found(
    integration_toktagger_client, seeded_project_with_samples
):
    project_id, _ = seeded_project_with_samples
    with pytest.raises(NotFoundError) as exc_info:
        integration_toktagger_client.get_data(project_id, MISSING_OBJECT_ID)
    assert exc_info.value.status_code == 404


def test_list_annotations_project_level(
    integration_toktagger_client, seeded_project_with_samples
):
    project_id, sample_ids = seeded_project_with_samples
    annotations = integration_toktagger_client.list_annotations(project_id)

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
    project_id, sample_ids = seeded_project_with_samples

    annotations = integration_toktagger_client.list_annotations(
        project_id, sample_id=sample_ids[0]
    )
    assert len(annotations) == 2
    assert all(isinstance(a, TimeRegion) for a in annotations)
    assert all(a.project_id == project_id for a in annotations)


def test_list_annotations_sample_level_filters(
    integration_toktagger_client, seeded_project_with_samples
):
    project_id, sample_ids = seeded_project_with_samples

    annotations = integration_toktagger_client.list_annotations(
        project_id, sample_id=sample_ids[0], validated=True
    )
    assert len(annotations) == 1
    assert annotations[0].label == "Flat Top"

    annotations = integration_toktagger_client.list_annotations(
        project_id, sample_id=sample_ids[0], validated=False
    )
    assert len(annotations) == 1
    assert annotations[0].label == "Ramp Up"


def test_list_annotations_missing_sample_raises_not_found(
    integration_toktagger_client, seeded_project_with_samples
):
    project_id, _ = seeded_project_with_samples
    with pytest.raises(NotFoundError) as exc_info:
        integration_toktagger_client.list_annotations(
            project_id, sample_id=MISSING_OBJECT_ID
        )
    assert exc_info.value.status_code == 404
