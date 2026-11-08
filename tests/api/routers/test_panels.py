import pathlib

import pytest
from pydantic import ValidationError

from toktagger.api.schemas.layouts import Layout
from toktagger.api.schemas.projects import ProjectIn

PARQUET_FILE = str(pathlib.Path(__file__).parents[2].joinpath("10000.parquet"))

LAYOUT = {
    "panels": [
        {"id": "radial", "kind": "radial_profile", "profile_signals": ["TE", "NE"]},
        {"id": "spectrogram", "kind": "profile_2d", "signal": "TE"},
        {"id": "traces", "kind": "time_series", "signals": ["ip"]},
        {
            "id": "file_traces",
            "kind": "time_series",
            "source": "file",
            "signals": ["Ip"],
        },
    ]
}

SOURCES = [
    {"name": "shot", "data_loader": "synthetic_radial"},
    {"name": "file", "data_loader": "tabular"},
]


def _project(**overrides) -> dict:
    project = {
        "name": "multi",
        "task": "multi-panel",
        "query_strategy": "random",
        "data_loader": "synthetic_radial",
        "sources": SOURCES,
        "layout": {
            "panels": [
                {**panel, "source": panel.get("source", "shot")}
                for panel in LAYOUT["panels"]
            ]
        },
    }
    return {**project, **overrides}


SAMPLE_SOURCES = {
    "shot": {"protocol": "uda", "signal_names": ["TE"]},
    "file": {"file_name": PARQUET_FILE, "type": "parquet"},
}


async def _create_multi_panel_sample(api_client) -> tuple[str, str]:
    response = await api_client.post("/projects", json=_project())
    assert response.status_code == 200, response.text
    project_id = response.json()["_id"]
    response = await api_client.post(
        f"/projects/{project_id}/samples",
        json=[{"shot_id": 1, "sources": SAMPLE_SOURCES}],
    )
    assert response.status_code == 200, response.text
    return project_id, response.json()[0]


def test_layout_rejects_duplicate_panel_ids():
    panel = {"id": "same", "kind": "time_series", "signals": ["ip"]}
    with pytest.raises(ValidationError, match="unique"):
        Layout.model_validate({"panels": [panel, panel]})


def test_multi_panel_project_requires_layout():
    with pytest.raises(ValidationError, match="must have a layout"):
        ProjectIn.model_validate(_project(layout=None))


def test_panel_source_must_exist():
    with pytest.raises(ValidationError, match="unknown data source"):
        ProjectIn.model_validate(_project(sources=SOURCES[:1]))


def test_legacy_project_gets_default_source():
    project = ProjectIn.model_validate(
        {
            "name": "legacy",
            "task": "time-series",
            "query_strategy": "random",
            "data_loader": "tabular",
        }
    )
    assert [(source.name, source.data_loader) for source in project.sources] == [
        ("default", "tabular")
    ]


@pytest.mark.asyncio
async def test_sample_must_match_source_types(api_client, setup_db):
    response = await api_client.post("/projects", json=_project())
    project_id = response.json()["_id"]
    response = await api_client.post(
        f"/projects/{project_id}/samples",
        json=[
            {
                "shot_id": 1,
                "sources": {**SAMPLE_SOURCES, "file": SAMPLE_SOURCES["shot"]},
            }
        ],
    )
    assert response.status_code == 422
    assert "TimeSeriesFileData" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_radial_panel_data(api_client, setup_db):
    project_id, sample_id = await _create_multi_panel_sample(api_client)
    response = await api_client.post(
        f"/projects/{project_id}/samples/{sample_id}/panels/radial/data", json={}
    )
    assert response.status_code == 200, response.text
    assert list(response.json()["profiles"]) == ["TE", "NE"]


@pytest.mark.asyncio
async def test_get_profile_2d_panel_data_keeps_panel_signal(api_client, setup_db):
    project_id, sample_id = await _create_multi_panel_sample(api_client)
    response = await api_client.post(
        f"/projects/{project_id}/samples/{sample_id}/panels/spectrogram/data",
        json={"view": {"name": "profile_2d", "signal_name": "NE", "time_max": 0.3}},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert max(data["time"]) <= 0.3
    # TE peaks near 1000 and NE near 4.5, so this proves the panel's TE was served.
    peak = max(value for row in data["values"] for value in row if value is not None)
    assert peak > 100


@pytest.mark.asyncio
async def test_get_time_series_panel_data_from_each_source(api_client, setup_db):
    project_id, sample_id = await _create_multi_panel_sample(api_client)
    response = await api_client.post(
        f"/projects/{project_id}/samples/{sample_id}/panels/traces/data", json={}
    )
    assert response.status_code == 200, response.text
    assert list(response.json()["values"]) == ["ip"]

    response = await api_client.post(
        f"/projects/{project_id}/samples/{sample_id}/panels/file_traces/data", json={}
    )
    assert response.status_code == 200, response.text
    assert list(response.json()["values"]) == ["Ip"]


@pytest.mark.asyncio
async def test_get_unknown_panel_data(api_client, setup_db):
    project_id, sample_id = await _create_multi_panel_sample(api_client)
    response = await api_client.post(
        f"/projects/{project_id}/samples/{sample_id}/panels/missing/data", json={}
    )
    assert response.status_code == 404
