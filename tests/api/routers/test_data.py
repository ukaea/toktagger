import pathlib

import pandas as pd
import pytest

from tests.defuse_files import DEFUSE_TIME, write_defuse_file
from toktagger.api.core import data_loaders
from toktagger.api.schemas.projects import Task


@pytest.mark.asyncio
async def test_get_data(api_client, setup_db):
    response = await api_client.post(
        f"/projects/{setup_db['project_id_2']}/samples/{setup_db['sample_id_4']}/data"
    )
    # Should collect data from '10000.parquet' file
    # Should only collect Ip, not dalpha
    assert response.status_code == 200
    data = response.json()
    assert data["values"].get("Ip")
    assert not data["values"].get("dalpha")
    assert data["values"]["Ip"]["time"] == list(range(100))
    # Load data from parquet, check it matches
    df = pd.read_parquet(pathlib.Path(__file__).parents[2].joinpath("10000.parquet"))
    assert data["values"]["Ip"]["values"] == df.Ip.tolist()


async def _create_defuse_sample(
    api_client, file_path: pathlib.Path, signal_names: list[str] | None, **project
) -> tuple[str, str]:
    data_loaders._get_defuse_signals.cache_clear()
    response = await api_client.post(
        "/projects",
        json={
            "name": "defuse_project",
            "task": Task.TIME_SERIES,
            "query_strategy": "sequential",
            "data_loader": "defuse",
            **project,
        },
    )
    assert response.status_code == 200, response.text
    project_id = response.json()["_id"]

    response = await api_client.post(
        f"/projects/{project_id}/samples",
        json=[
            {
                "shot_id": 12345,
                "data": {
                    "file_name": str(file_path),
                    "type": "h5",
                    "protocol": "file",
                    "signal_names": signal_names,
                },
            }
        ],
    )
    assert response.status_code == 200, response.text
    return project_id, response.json()[0]


@pytest.mark.asyncio
async def test_get_defuse_data(api_client, db_client, tmp_path):
    file_path = write_defuse_file(tmp_path / "MASTUno12345.h5")
    project_id, sample_id = await _create_defuse_sample(
        api_client, file_path, ["IPLA", "ZMAG", "missing"]
    )

    response = await api_client.post(f"/projects/{project_id}/samples/{sample_id}/data")
    assert response.status_code == 200, response.text
    values = response.json()["values"]
    assert values["IPLA"]["time"] == pytest.approx(DEFUSE_TIME.tolist())
    assert values["ZMAG"]["values"] == pytest.approx((DEFUSE_TIME + 2.0).tolist())
    assert values["missing"] is None


@pytest.mark.asyncio
async def test_get_defuse_data_applies_project_time_settings(
    api_client, db_client, tmp_path
):
    file_path = write_defuse_file(tmp_path / "MASTUno12345.h5")
    project_id, sample_id = await _create_defuse_sample(
        api_client, file_path, ["IPLA"], time_min=0.5, min_time_step=0.1
    )

    response = await api_client.post(f"/projects/{project_id}/samples/{sample_id}/data")
    assert response.status_code == 200, response.text
    time = response.json()["values"]["IPLA"]["time"]
    assert min(time) >= 0.5 - 1e-6
    assert len(time) < len(DEFUSE_TIME) // 2


@pytest.mark.asyncio
async def test_get_defuse_data_missing_file(api_client, db_client, tmp_path):
    project_id, sample_id = await _create_defuse_sample(
        api_client, tmp_path / "MASTUno1.h5", ["IPLA"]
    )

    response = await api_client.post(f"/projects/{project_id}/samples/{sample_id}/data")
    assert response.status_code == 404
