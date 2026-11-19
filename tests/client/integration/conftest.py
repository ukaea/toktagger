# Integration tests for the TokTagger client: the real server (run_server from
# tests/conftest.py) in a subprocess on :8002, seeded through tests/endpoints.py
# like the end-to-end suite

import pathlib

import pytest
import requests
import tests.endpoints as endpoints
from toktagger.client import TokTaggerClient
from toktagger.api.schemas.annotations import TimeRegion

BASE_URL = "http://localhost:8002"


@pytest.fixture()
def integration_toktagger_client(server_setup):
    token = endpoints.create_api_token()
    yield TokTaggerClient(base_url=BASE_URL, api_token=token)


@pytest.fixture()
def seeded_project(integration_toktagger_client):
    project_id = endpoints.create_project("seeded_project", "time-series", "tabular")
    yield project_id, []
    requests.delete(f"{BASE_URL}/projects/{project_id}")


@pytest.fixture()
def seeded_project_with_samples(integration_toktagger_client):
    # A project with two samples so shot-id lookups and summaries are exercised.
    # The parquet files under tests/ back these local samples (see e2e suite).
    project_id = endpoints.create_project(
        "seeded_project_with_samples", "time-series", "tabular"
    )
    sample_ids = endpoints.create_local_samples(
        project_id, [10000, 10001], pathlib.Path(__file__).parents[2], ["Ip"]
    )
    flat_top = TimeRegion(
        label="Flat Top",
        created_by="manual",
        time_min=10,
        time_max=20,
        validated=True,
        uncertainty=0,
    )
    ramp_up = TimeRegion(
        label="Ramp Up",
        created_by="manual",
        time_min=30,
        time_max=40,
        validated=False,
        uncertainty=0.5,
    )
    annotation_ids = endpoints.create_annotations(
        project_id,
        sample_ids[0],
        [flat_top.model_dump(mode="json"), ramp_up.model_dump(mode="json")],
    )
    endpoints.create_annotations(
        project_id,
        sample_ids[1],
        [flat_top.model_dump(mode="json")],
    )
    yield project_id, sample_ids, annotation_ids
    requests.delete(f"{BASE_URL}/projects/{project_id}")


@pytest.fixture()
def seeded_profile2d_project(integration_toktagger_client):
    # Mirrors the e2e profile-2d seeding: the tabular loader reads the raw
    # signal and the profile-2d view (STFT) produces the 2D profile.
    project_id = endpoints.create_project(
        "integration_toktagger_client_profile2d_project", "profile-2d", "tabular"
    )
    sample_ids = endpoints.create_local_samples(
        project_id,
        [10000],
        pathlib.Path(__file__).parents[2],
        ["Ip"],
        file_names=["profile2d.parquet"],
    )
    yield project_id, sample_ids
    requests.delete(f"{BASE_URL}/projects/{project_id}")


@pytest.fixture()
def seeded_image_project(integration_toktagger_client):
    # The "image" loader serves one frame per file from a folder of images
    project_id = endpoints.create_project(
        "integration_toktagger_client_image_project", "video", "image"
    )
    sample_ids = endpoints.create_image_samples(
        project_id,
        10000,
        pathlib.Path(__file__).parents[2] / "mast_images",
        "png",
    )
    yield project_id, sample_ids
    requests.delete(f"{BASE_URL}/projects/{project_id}")
