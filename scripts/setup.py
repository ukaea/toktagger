from pathlib import Path
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


def create_local_samples(project_id: str, shot_ids: list[int], shot_files: list[Path]):
    samples = []

    for shot_id, path in zip(shot_ids, shot_files):
        sample = {
            "project_id": project_id,
            "shot_id": shot_id,
            "data": {
                "file_name": f"/data/test/summary/{shot_id}.parquet",
                "type": "parquet",
                "protocol": "file",
            },
        }
        samples.append(sample)

    requests.put(f"http://localhost:8002/projects/{project_id}/samples", json=samples)


def main():
    shot_files = Path("./data/test/summary").glob("*.parquet")
    shot_files = list(shot_files)
    shot_ids = [int(path.stem) for path in shot_files]

    project_id = create_project("UDA Disruption Project", "disruption", "uda")
    create_uda_samples(project_id, shot_ids)

    project_id = create_project("Local ELM Project", "ELM", "parquet")
    create_local_samples(project_id, shot_ids, shot_files)


if __name__ == "__main__":
    main()
