import requests
import pathlib


def create_project(
    name: str, task: str, data_loader: str, query_strategy: str = "random"
) -> str:
    project = {
        "name": name,
        "task": task,
        "query_strategy": query_strategy,
        "data_loader": data_loader,
    }

    response = requests.post(
        "http://localhost:8002/projects",
        json=project,
    )
    assert response.status_code == 200

    project_id = response.json()["_id"]
    return project_id


def create_local_samples(
    project_id: str,
    shot_ids: list[int],
    base_path: str,
    columns: list[str] | None = None,
):
    samples = []

    base_path = pathlib.Path(base_path)
    for shot_id in shot_ids:
        sample = {
            "project_id": project_id,
            "shot_id": shot_id,
            "data": {
                "file_name": str(base_path / f"{shot_id}.parquet"),
                "type": "parquet",
                "protocol": "file",
                "signal_names": columns,
            },
        }
        samples.append(sample)

    response = requests.post(
        f"http://localhost:8002/projects/{project_id}/samples", json=samples
    )
    assert response.status_code == 200
    return response.json()


def create_image_samples(
    project_id: str,
    shot_id: int,
    base_path: str,
    file_type: str,
):
    samples = []

    sample = {
        "project_id": project_id,
        "shot_id": shot_id,
        "data": {
            "file_name": str(base_path),
            "type": file_type,
            "protocol": "file",
        },
    }
    samples.append(sample)

    response = requests.post(
        f"http://localhost:8002/projects/{project_id}/samples", json=samples
    )
    assert response.status_code == 200
    return response.json()


def create_uda_samples(
    project_id: str,
    shot_ids: list[int],
    signal_names: list[str] = ["ip", "ANE_DENSITY"],
):
    samples = []
    for shot_id in shot_ids:
        sample = {
            "project_id": project_id,
            "shot_id": shot_id,
            "data": {
                "signal_names": signal_names,
                "protocol": "uda",
            },
        }
        samples.append(sample)

    response = requests.post(
        f"http://localhost:8002/projects/{project_id}/samples", json=samples
    )

    assert response.status_code == 200
    return response.json()
