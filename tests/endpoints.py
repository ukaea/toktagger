import requests
import pathlib
import tests.db_definitions as db_definitions
from toktagger.api.schemas.annotations import TimeRegion


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
    file_names: list[str] = None,
):
    samples = []
    if not file_names:
        file_names = [f"{shot_id}.parquet" for shot_id in shot_ids]

    base_path = pathlib.Path(base_path)
    for file_name, shot_id in zip(file_names, shot_ids):
        sample = {
            "project_id": project_id,
            "shot_id": shot_id,
            "data": {
                "file_name": str(base_path / file_name),
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


def create_model_samples(setup_model_samples):
    response = requests.post(
        "http://localhost:8002/projects",
        json=db_definitions.PROJECT_2.model_dump(mode="json"),
    )
    assert response.status_code == 200

    project_id = response.json()["_id"]

    response = requests.post(
        f"http://localhost:8002/projects/{project_id}/samples",
        json=[sample.model_dump(mode="json") for sample in setup_model_samples],
    )
    assert response.status_code == 200
    sample_ids = response.json()

    return project_id, sample_ids


def create_query_strategy_samples(query_strategy: str):
    # Create project
    project_id = create_project(
        "Test Project", "time-series", "tabular", query_strategy=query_strategy
    )
    # And create samples,
    # but create them in reverse order of shot ID so that sorting by timestamp gives you opposite order
    sample_ids = create_local_samples(
        project_id,
        list(range(10004, 9999, -1)),
        pathlib.Path(__file__).parent,
        ["Ip"],
        ["10000.parquet"] * 5,
    )
    sample_ids.reverse()

    # Samples 10000, 10001 will have validated annotations
    for sample_id in sample_ids[:2]:
        flat_top = TimeRegion(
            label="Flat Top",
            created_by="manual",
            time_min=10,
            time_max=20,
            validated=True,
            uncertainty=0,
        )
        response = requests.put(
            f"http://localhost:8002/projects/{project_id}/samples/{sample_id}/annotations",
            json=[flat_top.model_dump(mode="json")],
        )
        assert response.status_code == 200

    # Sample 10002 will have middle uncertain annotation
    flat_top = TimeRegion(
        label="Flat Top",
        created_by="peak_detection",
        time_min=10,
        time_max=20,
        validated=False,
        uncertainty=0.5,
    )
    response = requests.put(
        f"http://localhost:8002/projects/{project_id}/samples/{sample_ids[2]}/annotations",
        json=[flat_top.model_dump(mode="json")],
    )
    assert response.status_code == 200

    # Sample 10003 will have no annotations

    # Sample 10004 will have most uncertain annotation, and least uncertain annotation
    # Should use most uncertain in query strategy
    ramp_up = TimeRegion(
        label="Flat Top",
        created_by="peak_detection",
        time_min=30,
        time_max=40,
        validated=False,
        uncertainty=0.9,
    )
    flat_top = TimeRegion(
        label="Ramp Up",
        created_by="peak_detection",
        time_min=10,
        time_max=20,
        validated=False,
        uncertainty=0.1,
    )
    response = requests.put(
        f"http://localhost:8002/projects/{project_id}/samples/{sample_ids[4]}/annotations",
        json=[ramp_up.model_dump(mode="json"), flat_top.model_dump(mode="json")],
    )
    assert response.status_code == 200

    return project_id, sample_ids
