import pathlib

import pandas as pd
import pytest
from bson import ObjectId

import tests.db_definitions as db_definitions
from tests import endpoints
from toktagger.api.schemas.annotations import TimePoint, TimeRegion
from toktagger.api.schemas.data import MultiVariateTimeSeriesData
from toktagger.api.schemas.projects import ProjectUpdate, QueryStrategyType
from toktagger.api.schemas.samples import SampleSummary, SampleUpdate
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
    project_id, _, _ = seeded_project_with_samples
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
    project_id, sample_ids, _ = seeded_project_with_samples
    samples = integration_toktagger_client.list_samples(project_id)
    assert sorted(s.id for s in samples) == sorted(sample_ids)
    assert all(isinstance(s, Sample) for s in samples)
    assert all(s._client is integration_toktagger_client for s in samples)


def test_list_samples_shot_id_filter(
    integration_toktagger_client, seeded_project_with_samples
):
    project_id, _, _ = seeded_project_with_samples
    samples = integration_toktagger_client.list_samples(project_id, shot_id=10000)
    assert len(samples) == 1
    assert samples[0].shot_id == 10000


@pytest.mark.parametrize(
    "sample_definitions",
    [
        [],
        [db_definitions.SAMPLE_1],
        [db_definitions.SAMPLE_2],
        [db_definitions.SAMPLE_3],
        [db_definitions.SAMPLE_4],
        [db_definitions.SAMPLE_3, db_definitions.SAMPLE_4],
    ],
    ids=["empty", "uda", "sal", "s3-csv", "local-parquet", "multiple"],
)
def test_create_samples(
    integration_toktagger_client, seeded_project, sample_definitions
):
    project_id = seeded_project[0]

    samples = integration_toktagger_client.create_samples(
        project_id, sample_definitions
    )

    assert len(samples) == len(sample_definitions)
    assert len({sample.id for sample in samples}) == len(samples)
    for sample, definition in zip(samples, sample_definitions, strict=True):
        assert isinstance(sample, Sample)
        assert ObjectId.is_valid(sample.id)
        assert sample._client is integration_toktagger_client
        assert sample.project_id == project_id
        assert sample.model_dump(
            exclude={"id", "project_id", "validated_annotations"}
        ) == (definition.model_dump(exclude={"annotations", "validated_annotations"}))
        assert sample.validated_annotations is False
        stored_sample = integration_toktagger_client.get_sample(project_id, sample.id)
        assert stored_sample.model_dump() == sample.model_dump()
        assert sample.list_annotations() == []
    assert sorted(
        result.id for result in integration_toktagger_client.list_samples(project_id)
    ) == sorted(sample.id for sample in samples)


def test_create_samples_with_annotations(integration_toktagger_client, seeded_project):
    annotation = db_definitions.ANNOTATION_1.model_copy(
        update={"shot_id": db_definitions.SAMPLE_4.shot_id}
    )
    sample_definition = db_definitions.SAMPLE_4.model_copy(
        update={"annotations": [annotation]}
    )

    [sample] = integration_toktagger_client.create_samples(
        seeded_project[0], [sample_definition]
    )

    assert sample.validated_annotations is True
    annotations = sample.list_annotations()
    assert len(annotations) == 1
    assert isinstance(annotations[0], TimeRegion)
    assert annotations[0].sample_id == sample.id
    assert annotations[0].project_id == seeded_project[0]
    assert annotations[0].shot_id == sample.shot_id
    assert annotations[0].label == db_definitions.ANNOTATION_1.label
    assert annotations[0].time_min == db_definitions.ANNOTATION_1.time_min
    assert annotations[0].time_max == db_definitions.ANNOTATION_1.time_max
    assert annotations[0].validated is True


def test_create_samples_missing_project(integration_toktagger_client):
    with pytest.raises(NotFoundError) as exc_info:
        integration_toktagger_client.create_samples(
            MISSING_OBJECT_ID, [db_definitions.SAMPLE_4]
        )
    assert exc_info.value.status_code == 404


@pytest.mark.parametrize(
    "updates, expected_validated",
    [
        (SampleUpdate(validated_annotations=True), True),
        (SampleUpdate(validated_annotations=False), False),
        (SampleUpdate(validated_annotations=None), True),
        (SampleUpdate(), True),
    ],
    ids=["validated", "unvalidated", "ignored-null", "no-changes"],
)
def test_update_sample(
    integration_toktagger_client,
    seeded_project_with_samples,
    updates,
    expected_validated,
):
    project_id, sample_ids, _ = seeded_project_with_samples
    original = integration_toktagger_client.update_sample(
        project_id, sample_ids[0], SampleUpdate(validated_annotations=True)
    )
    original_annotations = original.list_annotations()

    sample = integration_toktagger_client.update_sample(
        project_id, original.id, updates
    )

    assert isinstance(sample, Sample)
    assert sample._client is integration_toktagger_client
    assert sample.model_dump() == {
        **original.model_dump(),
        "validated_annotations": expected_validated,
    }
    stored_sample = integration_toktagger_client.get_sample(project_id, sample.id)
    assert stored_sample.model_dump() == sample.model_dump()
    assert sample.list_annotations() == original_annotations


def test_update_sample_missing(integration_toktagger_client, seeded_project):
    with pytest.raises(NotFoundError) as exc_info:
        integration_toktagger_client.update_sample(
            seeded_project[0],
            MISSING_OBJECT_ID,
            SampleUpdate(validated_annotations=True),
        )
    assert exc_info.value.status_code == 404


def test_update_sample_wrong_project(
    integration_toktagger_client, seeded_project, seeded_project_with_samples
):
    project_id, sample_ids, _ = seeded_project_with_samples
    original = integration_toktagger_client.get_sample(project_id, sample_ids[0])

    with pytest.raises(NotFoundError) as exc_info:
        integration_toktagger_client.update_sample(
            seeded_project[0],
            original.id,
            SampleUpdate(validated_annotations=not original.validated_annotations),
        )
    assert exc_info.value.status_code == 404
    assert integration_toktagger_client.get_sample(project_id, original.id) == original


def test_get_sample(integration_toktagger_client, seeded_project_with_samples):
    project_id, sample_ids, _ = seeded_project_with_samples
    sample = integration_toktagger_client.get_sample(project_id, sample_ids[0])
    assert isinstance(sample, Sample)
    assert sample.id == sample_ids[0]
    assert sample.project_id == project_id
    assert sample._client is integration_toktagger_client


def test_get_sample_by_shot_id(
    integration_toktagger_client, seeded_project_with_samples
):
    project_id, _, _ = seeded_project_with_samples
    sample = integration_toktagger_client.get_sample_by_shot_id(project_id, 10001)
    assert sample.shot_id == 10001
    assert sample.project_id == project_id
    assert sample._client is integration_toktagger_client


def test_get_sample_by_shot_id_missing(
    integration_toktagger_client, seeded_project_with_samples
):
    project_id, _, _ = seeded_project_with_samples
    with pytest.raises(NotFoundError) as exc_info:
        integration_toktagger_client.get_sample_by_shot_id(project_id, 99999)
    assert exc_info.value.status_code is None


def test_get_samples_summary(integration_toktagger_client, seeded_project_with_samples):
    project_id, _, _ = seeded_project_with_samples
    summary = integration_toktagger_client.get_samples_summary(project_id)
    assert isinstance(summary, SampleSummary)
    assert summary.total == 2
    assert summary.shot_min == 10000
    assert summary.shot_max == 10001


def test_get_data(integration_toktagger_client, seeded_project_with_samples):
    project_id, sample_ids, _ = seeded_project_with_samples
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
    project_id, _, _ = seeded_project_with_samples
    with pytest.raises(NotFoundError) as exc_info:
        integration_toktagger_client.get_data(project_id, MISSING_OBJECT_ID)
    assert exc_info.value.status_code == 404


def test_create_annotations(integration_toktagger_client, seeded_project_with_samples):
    project_id, sample_ids, _ = seeded_project_with_samples
    project = integration_toktagger_client.get_project(project_id)
    sample = project.get_sample(sample_ids[0])
    existing = project.list_annotations()
    other_annotations = project.get_sample(sample_ids[1]).list_annotations()
    annotations = [
        TimeRegion(label="new region", time_min=0.1, time_max=0.2, validated=True),
        TimePoint(label="new point", time=0.3),
    ]

    created_annotations = integration_toktagger_client.create_annotations(
        project_id, sample.id, annotations
    )

    assert len(created_annotations) == 2
    assert all(ObjectId.is_valid(annotation.id) for annotation in created_annotations)
    assert all(
        annotation._client is integration_toktagger_client
        for annotation in created_annotations
    )
    stored = project.list_annotations()
    assert len(stored) == len(existing) + 2
    assert {item.id for item in existing} <= {item.id for item in stored}
    for saved, annotation in zip(created_annotations, annotations, strict=True):
        assert next(item for item in stored if item.id == saved.id) == saved
        assert saved.project_id == project_id
        assert saved.sample_id == sample.id
        assert saved.shot_id == sample.shot_id
        assert saved.created_by is not None
        assert not saved.created_by.startswith(("model::", "annotators::"))
        input_fields = set(type(annotation).model_fields) - {
            "id",
            "project_id",
            "sample_id",
            "shot_id",
            "created_by",
        }
        assert saved.model_dump(include=input_fields) == annotation.model_dump(
            include=input_fields
        )
    assert project.get_sample(sample.id).validated_annotations is True
    assert project.get_sample(sample_ids[1]).list_annotations() == other_annotations


def test_get_annotation(integration_toktagger_client, seeded_project_with_samples):
    project_id, sample_ids, _ = seeded_project_with_samples
    original = integration_toktagger_client.list_annotations(project_id, sample_ids[0])[
        0
    ]

    annotation = integration_toktagger_client.get_annotation(
        project_id, sample_ids[0], original.id
    )

    assert isinstance(annotation, TimeRegion)
    assert annotation._client is integration_toktagger_client
    assert annotation.model_dump() == original.model_dump()
    assert annotation.created_by_name == "admin"


def test_update_annotation(integration_toktagger_client, seeded_project_with_samples):
    project_id, sample_ids, _ = seeded_project_with_samples
    existing = integration_toktagger_client.list_annotations(project_id)
    original = next(
        annotation for annotation in existing if annotation.sample_id == sample_ids[0]
    )
    updates = TimeRegion(label="corrected", time_min=0.5, time_max=0.6, validated=True)

    updated = integration_toktagger_client.update_annotation(
        project_id, sample_ids[0], original.id, updates
    )

    assert isinstance(updated, TimeRegion)
    assert updated._client is integration_toktagger_client
    assert updated.id == original.id
    assert updated.project_id == original.project_id
    assert updated.sample_id == original.sample_id
    assert updated.shot_id == original.shot_id
    assert updated.created_by == original.created_by
    assert updated.timestamp == original.timestamp
    assert updated.label == updates.label
    assert updated.time_min == updates.time_min
    assert updated.time_max == updates.time_max
    assert updated.validated is True
    assert updated.uncertainty == 0
    stored = integration_toktagger_client.list_annotations(project_id)
    assert len(stored) == len(existing)
    assert (
        next(annotation for annotation in stored if annotation.id == original.id)
        == updated
    )
    assert all(
        annotation in stored for annotation in existing if annotation.id != original.id
    )


def test_list_annotations_project_level(
    integration_toktagger_client, seeded_project_with_samples
):
    project_id, sample_ids, _ = seeded_project_with_samples
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
    project_id, sample_ids, _ = seeded_project_with_samples

    annotations = integration_toktagger_client.list_annotations(
        project_id, sample_id=sample_ids[0]
    )
    assert len(annotations) == 2
    assert all(isinstance(a, TimeRegion) for a in annotations)
    assert all(a.project_id == project_id for a in annotations)


def test_list_annotations_sample_level_filters(
    integration_toktagger_client, seeded_project_with_samples
):
    project_id, sample_ids, _ = seeded_project_with_samples

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
    project_id, _, _ = seeded_project_with_samples
    with pytest.raises(NotFoundError) as exc_info:
        integration_toktagger_client.list_annotations(
            project_id, sample_id=MISSING_OBJECT_ID
        )
    assert exc_info.value.status_code == 404
