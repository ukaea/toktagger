from pathlib import Path
from typing import Optional
import requests


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

    requests.put(f"http://localhost:8002/projects/{project_id}/samples", json=samples)


def create_local_samples(
    project_id: str,
    shot_ids: list[int],
    base_path: str,
    columns: Optional[list[str]] = None,
):
    samples = []

    base_path = Path(base_path)
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

    requests.put(f"http://localhost:8002/projects/{project_id}/samples", json=samples)


def main():
    shot_files = Path("./data/summary").glob("*.parquet")
    shot_files = list(shot_files)
    shot_ids = [int(path.stem) for path in shot_files]

    project_id = create_project("Full ELM Project", "ELM", "parquet")
    create_local_samples(
        project_id,
        shot_ids,
        base_path="/data/summary",
        columns=["dalpha", "ip", "power_nbi", "t_e_core", "sxr", "n_e_line"],
    )


if __name__ == "__main__":
    main()
