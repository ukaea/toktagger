import pytest
import pandas as pd
import pathlib


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


async def _create_radial_sample(api_client, signal_names: list[str]) -> tuple[str, str]:
    response = await api_client.post(
        "/projects",
        json={
            "name": "radial",
            "task": "radial-profile",
            "query_strategy": "random",
            "data_loader": "synthetic_radial",
        },
    )
    assert response.status_code == 200
    project_id = response.json()["_id"]
    response = await api_client.post(
        f"/projects/{project_id}/samples",
        json=[
            {"shot_id": 1, "data": {"protocol": "uda", "signal_names": signal_names}}
        ],
    )
    assert response.status_code == 200
    return project_id, response.json()[0]


@pytest.mark.asyncio
async def test_get_radial_profile_data(api_client, setup_db):
    project_id, sample_id = await _create_radial_sample(api_client, ["TE", "R", "ip"])
    response = await api_client.post(
        f"/projects/{project_id}/samples/{sample_id}/data",
        json={"view": {"name": "radial_profile", "radius_signal": "R"}},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["profile_signal"] == "TE"
    assert len(data["radius"]) == len(data["values"]) == len(data["time"])
    assert None in data["values"][0]
    assert list(data["time_series"]) == ["ip"]


@pytest.mark.asyncio
async def test_get_radial_profile_data_without_profile(api_client, setup_db):
    project_id, sample_id = await _create_radial_sample(api_client, ["ip"])
    response = await api_client.post(
        f"/projects/{project_id}/samples/{sample_id}/data",
        json={"view": {"name": "radial_profile"}},
    )
    assert response.status_code == 400
