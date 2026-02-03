from argparse import ArgumentParser
from pathlib import Path
from typing import Optional
import requests


def create_project(
    name: str,
    task: str,
    data_loader: str,
    query_strategy: str,
    time_min: float = -0.1,
    time_max: float = 0.8,
    min_time_step: float = 0.0001,
) -> str:
    project = {
        "name": name,
        "task": task,
        "query_strategy": query_strategy,
        "data_loader": data_loader,
        "time_min": time_min,
        "time_max": time_max,
        "min_time_step": min_time_step,
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
                "signal_names": ["ip", "ANE_DENSITY", "/xsx/HCAM/L/7"],
                "protocol": "uda",
            },
        }
        samples.append(sample)

    requests.post(f"http://localhost:8002/projects/{project_id}/samples", json=samples)


def create_sal_samples(project_id: str, shot_ids: list[int]):
    samples = []
    for shot_id in shot_ids:
        sample = {
            "project_id": project_id,
            "shot_id": shot_id,
            "data": {
                "signal_names": ["ppf/signal/jetppf/magn/ipla"],
                "protocol": "sal",
            },
        }
        samples.append(sample)

    requests.post(f"http://localhost:8002/projects/{project_id}/samples", json=samples)


def create_fair_mast_samples(project_id: str, shot_ids: list[int]):
    samples = []
    for shot_id in shot_ids:
        sample = {
            "project_id": project_id,
            "shot_id": shot_id,
            "data": {
                "signal_names": ["magnetics/ip"],
                "protocol": "fair_mast",
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
    annotations: Optional[list[dict]] = None,
):
    samples = []

    base_path = Path(base_path)
    for shot_id in shot_ids:
        file_name = str(base_path / f"{shot_id}.{file_type}")
        sample = {
            "shot_id": shot_id,
            "data": {
                "file_name": file_name,
                "type": file_type,
                "protocol": "file",
                "signal_names": signals,
            },
        }
        if annotations:
            sample["annotations"] = annotations[shot_id]
        samples.append(sample)

    requests.post(f"http://localhost:8002/projects/{project_id}/samples", json=samples)


def create_image_samples(project_id: str, shot_ids: list[int], image_dir: str):
    samples = []
    for shot_id in shot_ids:
        samples.append(
            {
                "project_id": project_id,
                "shot_id": int(shot_id),
                "data": {
                    "file_name": str(image_dir),  # directory, not a file
                    "type": "png",  # extension
                    "protocol": "file",  # MUST be file or s3
                },
            }
        )

    r = requests.post(
        f"http://localhost:8002/projects/{project_id}/samples", json=samples
    )
    r.raise_for_status()


def create_uda_camera_samples(project_id: str, shot_ids: list[int]):
    samples = []
    for shot_id in shot_ids:
        sample = {
            "project_id": project_id,
            "shot_id": shot_id,
            "data": {
                "signal_names": ["rbb"],
                "protocol": "uda_camera",
            },
        }
        samples.append(sample)

    requests.post(f"http://localhost:8002/projects/{project_id}/samples", json=samples)


def main():
    parser = ArgumentParser()
    parser.add_argument(
        "-b",
        "--base-path",
        default="./data/test",
        type=str,
        help="Base path for remote data files",
    )
    args = parser.parse_args()

    base_path = Path(args.base_path)

    shot_files = Path("./data/test/summary").glob("*.parquet")
    shot_files = list(shot_files)
    shot_ids = [int(path.stem) for path in shot_files]

    project_id = create_project(
        "UDA Disruption Project", "time-series", "uda", "sequential"
    )
    create_uda_samples(project_id, shot_ids)

    project_id = create_project(
        "Local ELM Project", "time-series", "tabular", "sequential"
    )
    create_local_samples(
        project_id, shot_ids, base_path=base_path / "summary", file_type="parquet"
    )

    shot_files = Path("./data/test/mhd").glob("*.parquet")
    shot_files = list(shot_files)
    shot_ids = [int(path.stem) for path in shot_files]
    project_id = create_project(
        "Local MHD Project", "spectrogram", "tabular", "random", min_time_step=0.000001
    )
    create_local_samples(
        project_id,
        shot_ids,
        base_path=base_path / "mhd",
        file_type="parquet",
        signals=["mirnov"],
    )
    # ---- Image / UFO demo project ----
    project_id = create_project("Frame Project", "video", "image", "random")
    create_image_samples(project_id, [30000], Path("./data/images"))

    # JET data
    project_id = create_project(
        "SAL Disruption Project", "time-series", "sal", query_strategy="sequential"
    )
    shot_ids = [87737]
    create_sal_samples(project_id, shot_ids)

    # FAIR MAST
    project_id = create_project(
        "FAIR MAST Project",
        "time-series",
        "fair_mast",
        query_strategy="sequential",
    )
    shot_ids = [30421]
    create_fair_mast_samples(project_id, shot_ids)

    shot_ids = [30421]
    project_id = create_project(
        "UDA Camera Frame Project", "video", "uda_camera", "random"
    )
    create_uda_camera_samples(project_id, shot_ids)

    print("Projects and samples created successfully.")


if __name__ == "__main__":
    main()
