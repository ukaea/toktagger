import requests
import pathlib


def create_project(name: str, task: str, data_loader: str) -> str:
    project = {
        "name": name,
        "task": task,
        "query_strategy": "random",
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
                "column_names": columns,
            },
        }
        samples.append(sample)

    requests.post(f"http://localhost:8002/projects/{project_id}/samples", json=samples)
