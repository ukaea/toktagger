import httpx
import pytest

from tests import db_definitions
from toktagger.api.schemas.annotations import TimeRegion
from toktagger.api.schemas.projects import ProjectUpdate
from toktagger.api.schemas.samples import SampleUpdate
from toktagger.client.client import Project, Sample, TokTaggerClient
from toktagger.client.exceptions import (
    MultipleResultsFoundError,
    NotFoundError,
    TokTaggerAPIError,
    TokTaggerClientError,
)


def test_404_raises_not_found_error(toktagger_client, setup_db):
    with pytest.raises(NotFoundError) as exc_info:
        toktagger_client.get_project("0" * 24)
    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Project not found with that ID."


def test_non_404_error_raises_api_error(toktagger_client, setup_db):
    with pytest.raises(TokTaggerAPIError) as exc_info:
        toktagger_client._request(
            "GET", "/projects", params={"sort_direction": "invalid"}
        )
    assert not isinstance(exc_info.value, NotFoundError)
    assert exc_info.value.status_code == 422
    assert "Input should be 'ascending' or 'descending'" in exc_info.value.detail


def test_non_json_error_body_uses_text():
    # Plain-text errors are parsed independently of the API's JSON error handlers.
    response = httpx.Response(400, text="Bad Request")
    assert TokTaggerClient._extract_detail(response) == "Bad Request"


def test_list_error_detail_is_stringified(toktagger_client, setup_db):
    with pytest.raises(TokTaggerAPIError) as exc_info:
        toktagger_client._request(
            "GET",
            f"/projects/{setup_db['project_id_1']}/samples",
            params={"shot_id": "invalid"},
        )
    assert exc_info.value.status_code == 422
    assert "Input should be a valid integer" in exc_info.value.detail


def test_transport_error_wrapped(toktagger_client):
    # Inject only the unreachable-server failure; normal requests use the test API.
    def fail_request(request):
        raise httpx.ConnectError("connection refused", request=request)

    toktagger_client._http.event_hooks["request"].append(fail_request)
    with pytest.raises(
        TokTaggerClientError, match="Failed to reach TokTagger server"
    ) as exc_info:
        toktagger_client.health()
    assert isinstance(exc_info.value.__cause__, httpx.ConnectError)


def test_error_hierarchy():
    multiple = MultipleResultsFoundError("2 projects matched name 'tokamak'")
    assert isinstance(multiple, TokTaggerClientError)
    assert not isinstance(multiple, TokTaggerAPIError)
    not_found = NotFoundError(None, "no match")
    assert isinstance(not_found, TokTaggerAPIError)
    assert not_found.status_code is None


def test_annotation_update_without_client_raises(toktagger_client, setup_db):
    bound_annotation = toktagger_client.list_annotations(
        setup_db["project_id_1"], setup_db["sample_id_1"]
    )[-1]
    annotation = type(bound_annotation).model_validate(bound_annotation.model_dump())

    with pytest.raises(TokTaggerClientError, match="no client attached"):
        annotation.update(TimeRegion(label="updated", time_min=0.5, time_max=0.6))


def test_sample_update_without_client_raises(toktagger_client, setup_db):
    bound_sample = toktagger_client.get_sample(
        setup_db["project_id_1"], setup_db["sample_id_1"]
    )
    sample = Sample.model_validate(bound_sample.model_dump())

    with pytest.raises(TokTaggerClientError, match="no client attached"):
        sample.update(SampleUpdate(validated_annotations=True))


def test_sample_get_annotation_without_client(toktagger_client, setup_db):
    bound_sample = toktagger_client.get_sample(
        setup_db["project_id_1"], setup_db["sample_id_1"]
    )
    sample = Sample.model_validate(bound_sample.model_dump())

    with pytest.raises(TokTaggerClientError, match="no client attached"):
        sample.get_annotation(setup_db["annotation_id_1"])


def test_sample_create_annotations_without_client(toktagger_client, setup_db):
    bound_sample = toktagger_client.get_sample(
        setup_db["project_id_1"], setup_db["sample_id_1"]
    )
    sample = Sample.model_validate(bound_sample.model_dump())

    with pytest.raises(TokTaggerClientError, match="no client attached"):
        sample.create_annotations([db_definitions.ANNOTATION_1])


def test_project_method_without_client_raises(toktagger_client, setup_db):
    raw = toktagger_client._request(
        "GET", f"/projects/{setup_db['project_id_1']}"
    ).json()
    project = Project.model_validate(raw)
    assert project._client is None
    with pytest.raises(TokTaggerClientError, match="no client attached"):
        project.create_samples([db_definitions.SAMPLE_3])
    with pytest.raises(TokTaggerClientError, match="no client attached"):
        project.update(ProjectUpdate(name="updated_project"))
    with pytest.raises(TokTaggerClientError, match="no client attached"):
        project.list_samples()
    with pytest.raises(TokTaggerClientError):
        project.get_sample(setup_db["sample_id_1"])
    with pytest.raises(TokTaggerClientError):
        project.get_sample_by_shot_id(1)
    with pytest.raises(TokTaggerClientError):
        project.get_samples_summary()
