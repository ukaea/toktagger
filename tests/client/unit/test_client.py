from pathlib import Path
from typing import get_args

import numpy as np
import pandas as pd
import pytest
import pytest_asyncio
from bson import ObjectId
from PIL import Image

import tests.db_definitions as db_definitions
from toktagger.api.schemas.annotations import (
    AnnotationOutTypes as AnnotationOutSchemaTypes,
    TimePoint,
    TimeRegion,
)
from toktagger.api.schemas.data import (
    ImageData,
    ImageParams,
    MultiVariateTimeSeriesData,
)
from toktagger.api.schemas.projects import (
    Project as ProjectSchema,
    ProjectUpdate,
    QueryStrategyType,
)
from toktagger.api.schemas.samples import ImageFileData, SampleIn, SampleUpdate
from toktagger.api.schemas.samples import Sample as SampleSchema, SampleSummary
from toktagger.client import TokTaggerClient
from toktagger.client.client import Project, Sample
from toktagger.client.schemas import Annotation, AnnotationOutTypes
from toktagger.client.exceptions import (
    AuthenticationError,
    MultipleResultsFoundError,
    NotFoundError,
    TokTaggerAPIError,
)


@pytest_asyncio.fixture
async def duplicate_project(db_client, setup_db):
    return await db_client.insert("projects", db_definitions.PROJECT_1)


@pytest_asyncio.fixture
async def duplicate_sample(db_client, setup_db):
    return await db_client.insert(
        "samples",
        db_definitions.SAMPLE_1,
        ids={"project_id": ObjectId(setup_db["project_id_1"])},
    )


@pytest_asyncio.fixture
async def image_sample(db_client, setup_db):
    return await db_client.insert(
        "samples",
        SampleIn(
            shot_id=5,
            data=ImageFileData(
                file_name=str(Path(__file__).parents[2] / "mast_images"), type="png"
            ),
        ),
        ids={"project_id": ObjectId(setup_db["project_id_3"])},
    )


def test_health_parses_json(toktagger_client):
    health = toktagger_client.health()
    assert health["name"] == "TokTagger"
    assert health["db_connected"] is True
    assert health["testing_mode"] is True


def test_base_url_trailing_slash_removed():
    with TokTaggerClient(
        base_url="http://localhost:8002/", api_token="test-token"
    ) as client:
        assert client._base_url == "http://localhost:8002"


def test_headers_are_passed(toktagger_client, setup_db):
    # Project endpoints require the bearer token created by the shared fixture.
    assert toktagger_client._http.headers["Authorization"].startswith("Bearer ")
    assert (
        toktagger_client.get_project(setup_db["project_id_1"]).id
        == setup_db["project_id_1"]
    )


def test_context_manager_closes_client(toktagger_client):
    with toktagger_client:
        assert not toktagger_client._http.is_closed
        assert toktagger_client.health()["db_connected"] is True
    assert toktagger_client._http.is_closed


def test_bootstrap_project(toktagger_client, setup_db):
    raw = toktagger_client._request(
        "GET", f"/projects/{setup_db['project_id_1']}"
    ).json()
    project = toktagger_client._bootstrap_project(raw)
    assert isinstance(project, Project)
    assert isinstance(project, ProjectSchema)
    assert project.id == setup_db["project_id_1"]
    assert project.name == db_definitions.PROJECT_1.name
    assert project._client is toktagger_client
    assert project.model_dump() == ProjectSchema.model_validate(raw).model_dump()


def test_bootstrap_sample(toktagger_client, setup_db):
    raw = toktagger_client._request(
        "GET", f"/projects/{setup_db['project_id_1']}/samples/{setup_db['sample_id_1']}"
    ).json()
    sample = toktagger_client._bootstrap_sample(raw)
    assert isinstance(sample, Sample)
    assert isinstance(sample, SampleSchema)
    assert sample.id == setup_db["sample_id_1"]
    assert sample.project_id == setup_db["project_id_1"]
    assert sample._client is toktagger_client
    assert sample.model_dump() == SampleSchema.model_validate(raw).model_dump()


def test_list_projects_returns_bootstrapped(toktagger_client, setup_db):
    projects = toktagger_client.list_projects()
    assert [project.id for project in projects] == [
        setup_db["project_id_3"],
        setup_db["project_id_2"],
        setup_db["project_id_1"],
    ]
    assert all(isinstance(project, Project) for project in projects)
    assert all(project._client is toktagger_client for project in projects)


def test_list_projects_forwards_filters(toktagger_client, setup_db):
    projects = toktagger_client.list_projects(
        name="test_project",
        start=1,
        count=1,
        sort_by="name",
        sort_direction="ascending",
    )
    assert [project.id for project in projects] == [setup_db["project_id_2"]]


@pytest.mark.parametrize(
    "project_definition",
    [
        db_definitions.PROJECT_1,
        db_definitions.PROJECT_2,
        db_definitions.PROJECT_3,
    ],
    ids=["profile-2d", "time-series", "video"],
)
def test_create_project(toktagger_client, project_definition):
    original_config = project_definition.model_dump()

    project = toktagger_client.create_project(project_definition)

    assert isinstance(project, Project)
    assert ObjectId.is_valid(project.id)
    assert project._client is toktagger_client
    assert project.model_dump(exclude={"id"}) == original_config
    assert project.list_samples() == []


def test_create_project_invalid_token(toktagger_client):
    toktagger_client._http.headers["Authorization"] = "Bearer invalid-token"
    with pytest.raises(AuthenticationError, match="could not authenticate") as exc_info:
        toktagger_client.create_project(db_definitions.PROJECT_2)
    assert exc_info.value.status_code == 401


def test_create_project_server_validation_error(toktagger_client):
    project_config = db_definitions.PROJECT_2.model_copy(
        update={"data_loader": "invalid-loader"}
    )
    with pytest.raises(TokTaggerAPIError) as exc_info:
        toktagger_client.create_project(project_config)
    assert exc_info.value.status_code == 422
    assert "data_loader" in exc_info.value.detail
    assert toktagger_client.list_projects() == []


def test_update_project(toktagger_client, setup_db):
    project = toktagger_client.get_project(setup_db["project_id_1"])
    updates = ProjectUpdate(
        name="updated_project", query_strategy=QueryStrategyType.RANDOM
    )
    updated_project = toktagger_client.update_project(project.id, updates)

    assert isinstance(updated_project, Project)
    assert updated_project._client is toktagger_client
    assert updated_project.query_strategy == "random"
    assert updated_project.name == "updated_project"
    assert updated_project.id == setup_db["project_id_1"]
    assert len(updated_project.list_samples()) == 2


def test_update_project_missing(toktagger_client):
    with pytest.raises(NotFoundError) as exc_info:
        toktagger_client.update_project("0" * 24, ProjectUpdate(name="updated"))
    assert exc_info.value.status_code == 404


def test_project_update_delegates(toktagger_client, setup_db):
    project = toktagger_client.get_project(setup_db["project_id_1"])

    updated_project = project.update(ProjectUpdate(name="updated_project"))

    assert isinstance(updated_project, Project)
    assert updated_project._client is toktagger_client
    assert updated_project.name == "updated_project"
    assert project.name == db_definitions.PROJECT_1.name


def test_get_project_returns_bootstrapped(toktagger_client, setup_db):
    project = toktagger_client.get_project(setup_db["project_id_1"])
    assert isinstance(project, Project)
    assert project.id == setup_db["project_id_1"]
    assert project._client is toktagger_client


def test_get_project_by_name_single_match(toktagger_client, setup_db):
    project = toktagger_client.get_project_by_name(db_definitions.PROJECT_1.name)
    assert project.id == setup_db["project_id_1"]
    assert project._client is toktagger_client


def test_get_project_by_name_no_match(toktagger_client, setup_db):
    with pytest.raises(NotFoundError) as exc_info:
        toktagger_client.get_project_by_name("does not exist")
    assert exc_info.value.status_code is None


def test_get_project_by_name_multiple_match(toktagger_client, duplicate_project):
    with pytest.raises(MultipleResultsFoundError, match="2 projects"):
        toktagger_client.get_project_by_name(db_definitions.PROJECT_1.name)


def test_list_samples_returns_bootstrapped(toktagger_client, setup_db):
    samples = toktagger_client.list_samples(setup_db["project_id_1"])
    assert [sample.id for sample in samples] == [
        setup_db["sample_id_2"],
        setup_db["sample_id_1"],
    ]
    assert all(isinstance(sample, Sample) for sample in samples)
    assert all(sample._client is toktagger_client for sample in samples)


def test_list_samples_forwards_shot_id_and_count(toktagger_client, setup_db):
    samples = toktagger_client.list_samples(
        setup_db["project_id_1"], shot_id=1, count=1
    )
    assert [sample.id for sample in samples] == [setup_db["sample_id_1"]]
    limited_samples = toktagger_client.list_samples(setup_db["project_id_1"], count=1)
    assert [sample.id for sample in limited_samples] == [setup_db["sample_id_2"]]


def test_create_sample(toktagger_client, setup_db):
    project_id = setup_db["project_id_2"]

    sample = toktagger_client.create_sample(project_id, db_definitions.SAMPLE_3)

    assert isinstance(sample, Sample)
    assert ObjectId.is_valid(sample.id)
    assert sample._client is toktagger_client
    assert sample.project_id == project_id
    assert sample.shot_id == db_definitions.SAMPLE_3.shot_id
    assert sample.data == db_definitions.SAMPLE_3.data
    assert sample.validated_annotations is False
    assert sample.list_annotations() == []


def test_create_sample_missing_project(toktagger_client):
    with pytest.raises(NotFoundError) as exc_info:
        toktagger_client.create_sample("0" * 24, db_definitions.SAMPLE_3)
    assert exc_info.value.status_code == 404


def test_project_create_sample_delegates(toktagger_client, setup_db):
    project = toktagger_client.get_project(setup_db["project_id_2"])

    sample = project.create_sample(db_definitions.SAMPLE_3)

    assert isinstance(sample, Sample)
    assert sample._client is toktagger_client
    assert sample.project_id == project.id
    assert sample.shot_id == db_definitions.SAMPLE_3.shot_id


def test_update_sample(toktagger_client, setup_db):
    project_id = setup_db["project_id_1"]
    sample_id = setup_db["sample_id_1"]

    sample = toktagger_client.update_sample(
        project_id, sample_id, SampleUpdate(validated_annotations=True)
    )

    assert isinstance(sample, Sample)
    assert sample._client is toktagger_client
    assert sample.id == sample_id
    assert sample.project_id == project_id
    assert sample.shot_id == db_definitions.SAMPLE_1.shot_id
    assert sample.validated_annotations is True
    assert len(sample.list_annotations()) == 3


def test_update_sample_missing(toktagger_client, setup_db):
    with pytest.raises(NotFoundError) as exc_info:
        toktagger_client.update_sample(
            setup_db["project_id_1"], "0" * 24, SampleUpdate(validated_annotations=True)
        )
    assert exc_info.value.status_code == 404


def test_sample_update_delegates(toktagger_client, setup_db):
    sample = toktagger_client.get_sample(
        setup_db["project_id_1"], setup_db["sample_id_1"]
    )

    updated_sample = sample.update(SampleUpdate(validated_annotations=True))

    assert isinstance(updated_sample, Sample)
    assert updated_sample._client is toktagger_client
    assert updated_sample.id == sample.id
    assert updated_sample.validated_annotations is True
    assert sample.validated_annotations is False


def test_get_sample_returns_bootstrapped(toktagger_client, setup_db):
    sample = toktagger_client.get_sample(
        setup_db["project_id_1"], setup_db["sample_id_1"]
    )
    assert isinstance(sample, Sample)
    assert sample.id == setup_db["sample_id_1"]
    assert sample.project_id == setup_db["project_id_1"]
    assert sample._client is toktagger_client


def test_get_sample_by_shot_id_single_match(toktagger_client, setup_db):
    sample = toktagger_client.get_sample_by_shot_id(setup_db["project_id_1"], 1)
    assert sample.id == setup_db["sample_id_1"]
    assert sample._client is toktagger_client


def test_get_sample_by_shot_id_no_match(toktagger_client, setup_db):
    with pytest.raises(NotFoundError) as exc_info:
        toktagger_client.get_sample_by_shot_id(setup_db["project_id_1"], 999)
    assert exc_info.value.status_code is None


def test_get_sample_by_shot_id_multiple_match(
    toktagger_client, setup_db, duplicate_sample
):
    with pytest.raises(MultipleResultsFoundError, match="2 samples"):
        toktagger_client.get_sample_by_shot_id(setup_db["project_id_1"], 1)


def test_project_list_samples_delegates(toktagger_client, setup_db):
    project = toktagger_client.get_project(setup_db["project_id_1"])
    samples = project.list_samples(shot_id=1)
    assert [sample.id for sample in samples] == [setup_db["sample_id_1"]]
    assert all(isinstance(sample, Sample) for sample in samples)
    assert all(sample._client is toktagger_client for sample in samples)


def test_project_get_sample_delegates(toktagger_client, setup_db):
    sample = toktagger_client.get_project(setup_db["project_id_1"]).get_sample(
        setup_db["sample_id_1"]
    )
    assert sample.id == setup_db["sample_id_1"]
    assert sample._client is toktagger_client


def test_project_get_sample_by_shot_id_delegates(toktagger_client, setup_db):
    sample = toktagger_client.get_project(
        setup_db["project_id_1"]
    ).get_sample_by_shot_id(1)
    assert sample.id == setup_db["sample_id_1"]


def test_project_get_samples_summary_delegates(toktagger_client, setup_db):
    summary = toktagger_client.get_project(
        setup_db["project_id_1"]
    ).get_samples_summary()
    assert isinstance(summary, SampleSummary)
    assert summary.total == 2
    assert summary.shot_min == 1
    assert summary.shot_max == 2


def test_chained_retrieval_style(toktagger_client, setup_db):
    sample = toktagger_client.get_project(setup_db["project_id_1"]).get_sample(
        setup_db["sample_id_1"]
    )
    assert isinstance(sample, Sample)
    assert sample.id == setup_db["sample_id_1"]
    assert sample.project_id == setup_db["project_id_1"]
    assert sample._client is toktagger_client


def test_get_data_parses_response(toktagger_client, setup_db):
    data = toktagger_client.get_data(setup_db["project_id_2"], setup_db["sample_id_4"])
    assert isinstance(data, MultiVariateTimeSeriesData)
    assert set(data.values) == {"Ip"}
    assert data.values["Ip"].time == list(range(100))
    expected = pd.read_parquet(db_definitions.SAMPLE_4.data.file_name)
    assert data.values["Ip"].values == expected.Ip.tolist()


def test_get_data_forwards_image_params(toktagger_client, setup_db, image_sample):
    data = toktagger_client.get_data(
        setup_db["project_id_3"],
        image_sample,
        params=ImageParams(frame=1, return_raw=True),
    )
    assert isinstance(data, ImageData)
    assert data.frame == 1
    assert isinstance(data.values, list)
    with Image.open(Path(__file__).parents[2] / "mast_images" / "1.png") as image:
        np.testing.assert_array_equal(data.to_processed(), np.asarray(image))


def test_get_data_missing_sample_raises_not_found(toktagger_client, setup_db):
    with pytest.raises(NotFoundError) as exc_info:
        toktagger_client.get_data(setup_db["project_id_2"], "0" * 24)
    assert exc_info.value.status_code == 404


def test_create_annotations(toktagger_client, setup_db):
    project_id = setup_db["project_id_1"]
    sample_id = setup_db["sample_id_1"]
    existing = toktagger_client.list_annotations(project_id)
    annotation = TimeRegion(label="new region", time_min=0.5, time_max=0.6)

    annotation_ids = toktagger_client.create_annotations(
        project_id, sample_id, [annotation]
    )

    assert len(annotation_ids) == 1
    assert ObjectId.is_valid(annotation_ids[0])
    stored = toktagger_client.list_annotations(project_id)
    assert len(stored) == len(existing) + 1
    assert {item.id for item in existing} <= {item.id for item in stored}
    created = next(item for item in stored if item.id == annotation_ids[0])
    assert isinstance(created, TimeRegion)
    assert created.project_id == project_id
    assert created.sample_id == sample_id
    assert created.shot_id == 1
    assert created.time_min == annotation.time_min
    assert created.time_max == annotation.time_max
    assert created.created_by == db_definitions.USER_ADMIN_ID


def test_sample_create_annotations(toktagger_client, setup_db):
    sample = toktagger_client.get_sample(
        setup_db["project_id_1"], setup_db["sample_id_1"]
    )

    annotation_ids = sample.create_annotations([db_definitions.ANNOTATION_1])

    assert len(annotation_ids) == 1
    assert len(sample.list_annotations()) == 4
    assert annotation_ids[0] != setup_db["annotation_id_1"]


@pytest.mark.parametrize("target", ["project", "sample", "wrong_project"])
def test_create_annotations_missing_target(toktagger_client, setup_db, target):
    project_id = setup_db["project_id_1"]
    sample_id = setup_db["sample_id_1"]
    if target == "project":
        project_id = "0" * 24
    elif target == "sample":
        sample_id = "0" * 24
    else:
        project_id = setup_db["project_id_2"]
    annotation = TimeRegion(label="missing", time_min=0, time_max=1)

    with pytest.raises(NotFoundError) as exc_info:
        toktagger_client.create_annotations(project_id, sample_id, [annotation])

    assert exc_info.value.status_code == 404


def test_create_annotations_empty(toktagger_client, setup_db):
    project_id = setup_db["project_id_1"]
    existing = toktagger_client.list_annotations(project_id)

    assert (
        toktagger_client.create_annotations(project_id, setup_db["sample_id_1"], [])
        == []
    )

    assert toktagger_client.list_annotations(project_id) == existing


@pytest.mark.parametrize("server_schema", get_args(AnnotationOutSchemaTypes))
def test_client_annotation_schemas_match_server(server_schema):
    client_schemas = get_args(AnnotationOutTypes)
    assert len(client_schemas) == len(get_args(AnnotationOutSchemaTypes))
    matching_schemas = [
        client_schema
        for client_schema in client_schemas
        if issubclass(client_schema, server_schema)
    ]
    assert len(matching_schemas) == 1
    client_schema = matching_schemas[0]
    assert issubclass(client_schema, Annotation)
    assert client_schema.model_json_schema() == server_schema.model_json_schema()


@pytest.mark.parametrize(
    "annotation_key, annotation_type",
    [("annotation_id_1", TimeRegion), ("annotation_id_3", TimePoint)],
)
def test_get_annotation(toktagger_client, setup_db, annotation_key, annotation_type):
    annotation = toktagger_client.get_annotation(
        setup_db["project_id_1"], setup_db["sample_id_1"], setup_db[annotation_key]
    )

    assert isinstance(annotation, annotation_type)
    assert isinstance(annotation, Annotation)
    assert annotation.id == setup_db[annotation_key]
    assert annotation._client is toktagger_client
    assert annotation.created_by_name is not None


@pytest.mark.parametrize(
    "annotation_key, annotation_type",
    [("annotation_id_1", TimeRegion), ("annotation_id_3", TimePoint)],
)
def test_sample_get_annotation(
    toktagger_client, setup_db, annotation_key, annotation_type
):
    sample = toktagger_client.get_sample(
        setup_db["project_id_1"], setup_db["sample_id_1"]
    )

    annotation = sample.get_annotation(setup_db[annotation_key])

    assert isinstance(annotation, annotation_type)
    assert isinstance(annotation, Annotation)
    assert annotation.id == setup_db[annotation_key]
    assert annotation.project_id == sample.project_id
    assert annotation.sample_id == sample.id
    assert annotation._client is toktagger_client
    assert annotation.created_by_name is not None


@pytest.mark.parametrize(
    "annotation_key", ["annotation_id_4", None], ids=["other-sample", "missing"]
)
def test_sample_get_annotation_missing(toktagger_client, setup_db, annotation_key):
    sample = toktagger_client.get_sample(
        setup_db["project_id_1"], setup_db["sample_id_1"]
    )
    annotation_id = setup_db[annotation_key] if annotation_key else "0" * 24

    with pytest.raises(NotFoundError) as exc_info:
        sample.get_annotation(annotation_id)

    assert exc_info.value.status_code == 404


@pytest.mark.parametrize("target", ["missing", "wrong_sample", "wrong_project"])
def test_get_annotation_missing(toktagger_client, setup_db, target):
    project_id = setup_db["project_id_1"]
    sample_id = setup_db["sample_id_1"]
    annotation_id = setup_db["annotation_id_1"]
    if target == "missing":
        annotation_id = "0" * 24
    elif target == "wrong_sample":
        sample_id = setup_db["sample_id_2"]
    else:
        project_id = setup_db["project_id_2"]
        sample_id = setup_db["sample_id_3"]

    with pytest.raises(NotFoundError) as exc_info:
        toktagger_client.get_annotation(project_id, sample_id, annotation_id)

    assert exc_info.value.status_code == 404


def test_update_annotation(toktagger_client, setup_db):
    project_id = setup_db["project_id_1"]
    sample_id = setup_db["sample_id_1"]
    original = toktagger_client.list_annotations(project_id, sample_id)[0]
    updates = TimePoint(label="corrected", time=0.7, validated=True)

    updated = toktagger_client.update_annotation(
        project_id, sample_id, original.id, updates
    )

    assert isinstance(updated, TimePoint)
    assert isinstance(updated, Annotation)
    assert updated.id == original.id
    assert updated.created_by == original.created_by
    assert updated.label == "corrected"
    assert updated.time == 0.7
    assert updated.validated is True
    assert updated.uncertainty == 0
    assert updated._client is toktagger_client
    assert original.label != updated.label


def test_update_annotation_missing(toktagger_client, setup_db):
    with pytest.raises(NotFoundError) as exc_info:
        toktagger_client.update_annotation(
            setup_db["project_id_1"],
            setup_db["sample_id_1"],
            "0" * 24,
            TimeRegion(label="missing", time_min=0.5, time_max=0.6),
        )
    assert exc_info.value.status_code == 404


def test_list_annotations_project_level(toktagger_client, setup_db):
    annotations = toktagger_client.list_annotations(setup_db["project_id_1"])
    assert [annotation.id for annotation in annotations] == [
        setup_db["annotation_id_4"],
        setup_db["annotation_id_3"],
        setup_db["annotation_id_2"],
        setup_db["annotation_id_1"],
    ]
    assert isinstance(annotations[0], TimePoint)
    assert isinstance(annotations[-1], TimeRegion)
    assert annotations[-1].time_min == 0.2
    assert annotations[-1].label == "annotation"


def test_list_annotations_sample_level(toktagger_client, setup_db):
    annotations = toktagger_client.list_annotations(
        setup_db["project_id_1"],
        sample_id=setup_db["sample_id_1"],
        validated=True,
        start=1,
        count=1,
        sort_by="timestamp",
        sort_direction="ascending",
    )
    assert [annotation.id for annotation in annotations] == [
        setup_db["annotation_id_2"],
    ]
    assert isinstance(annotations[0], TimeRegion)


def test_project_get_data_delegates(toktagger_client, setup_db):
    data = toktagger_client.get_project(setup_db["project_id_2"]).get_data(
        setup_db["sample_id_4"]
    )
    assert isinstance(data, MultiVariateTimeSeriesData)
    assert data.values["Ip"].time == list(range(100))


def test_project_list_annotations_delegates(toktagger_client, setup_db):
    annotations = toktagger_client.get_project(
        setup_db["project_id_1"]
    ).list_annotations(validated=True)
    assert [annotation.id for annotation in annotations] == [
        setup_db["annotation_id_2"],
        setup_db["annotation_id_1"],
    ]
    assert all(isinstance(annotation, TimeRegion) for annotation in annotations)


def test_sample_get_data_delegates(toktagger_client, setup_db):
    sample = toktagger_client.get_project(setup_db["project_id_2"]).get_sample(
        setup_db["sample_id_4"]
    )
    data = sample.get_data()
    assert isinstance(data, MultiVariateTimeSeriesData)
    assert data.values["Ip"].time == list(range(100))


def test_sample_list_annotations_delegates(toktagger_client, setup_db):
    sample = toktagger_client.get_project(setup_db["project_id_1"]).get_sample(
        setup_db["sample_id_1"]
    )
    annotations = sample.list_annotations(validated=True)
    assert [annotation.id for annotation in annotations] == [
        setup_db["annotation_id_2"],
        setup_db["annotation_id_1"],
    ]
    assert all(isinstance(annotation, TimeRegion) for annotation in annotations)
