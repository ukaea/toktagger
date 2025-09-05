from pathlib import Path
from typing import Optional
import requests


def create_project(name: str, task: str, data_loader: str, query_strategy: str) -> str:
    project = {
        "name": name,
        "task": task,
        "query_strategy": "uncertainty",
        "data_loader": data_loader,
    }

    response = requests.post(
        "http://localhost:8002/projects",
        json=project,
    )
    project_id = response.json()["_id"]
    return project_id


def create_uda_samples(project_id: str, shot_ids: list[int]):
    samples = []
    for shot_id in shot_ids:
        sample = {
            "project_id": project_id,
            "shot_id": shot_id,
            "data": {
                "signal_names": ["ip", "ANE_DENSITY"],
                "protocol": "uda",
            },
        }
        samples.append(sample)

    requests.post(f"http://localhost:8002/projects/{project_id}/samples", json=samples)


def create_local_samples(
    project_id: str,
    shot_ids: list[int],
    base_path: str,
    file_type: str,
    signals: Optional[list[str]] = None,
    annotations: Optional[list[dict]] = None
):
    samples = []

    base_path = Path(base_path)
    file_name = str(base_path)
    for shot_id in shot_ids:
        if file_type != "json":
            file_name = str(base_path / f"{shot_id}.{file_type}")
        sample = {
            "shot_id": shot_id,
            "data": {
                "file_name": file_name,
                "type": file_type,
                "protocol": "file",
                "signal_names": signals,
            }
        }
        if annotations:
            sample["annotations"] = annotations[shot_id]
        samples.append(sample)

    requests.post(f"http://localhost:8002/projects/{project_id}/samples", json=samples)


def main():
    shot_files = Path("./data/test/summary").glob("*.parquet")
    shot_files = list(shot_files)
    shot_ids = [int(path.stem) for path in shot_files]

    project_id = create_project("UDA Disruption Project", "disruption", "uda", "random")
    create_uda_samples(project_id, shot_ids)

    project_id = create_project("Local ELM Project", "ELM", "parquet", "random")
    create_local_samples(project_id, shot_ids, base_path="/data/test/summary", file_type="parquet")

    shot_files = Path("./data/test/mhd").glob("*.parquet")
    shot_files = list(shot_files)
    shot_ids = [int(path.stem) for path in shot_files]
    project_id = create_project("Local MHD Project", "MHD", "parquet", "random")
    create_local_samples(
        project_id, shot_ids, base_path="/data/test/mhd", file_type="parquet", signals=["mirnov"]
    )


if __name__ == "__main__":
    main()
