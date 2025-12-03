import json
from pathlib import Path
import tomllib
import webbrowser
import argparse

import requests
from toktagger.api.main import Server
import uvicorn
import time
import threading

from toktagger.api.schemas.projects import ProjectIn
from toktagger.api.schemas.samples import (
    FileProtocol,
    FileType,
    SampleIn,
    ShotData,
    ShotProtocol,
    TimeSeriesFileData,
)

# Need to point to app as a module level string if we want reload option
server = Server()
server._setup_app()
app = server.app


def do_open_browser(host: str, port: int):
    time.sleep(1)  # allow server to start
    webbrowser.open(f"http://{host}:{port}/ui/projects")


def run_toktagger(args):
    print("""

  ▗▄▄▄▖▗▄▖ ▗▖ ▗▖▗▄▄▄▖▗▄▖  ▗▄▄▖ ▗▄▄▖▗▄▄▄▖▗▄▄▖ 
    █ ▐▌ ▐▌▐▌▗▞▘  █ ▐▌ ▐▌▐▌   ▐▌   ▐▌   ▐▌ ▐▌
    █ ▐▌ ▐▌▐▛▚▖   █ ▐▛▀▜▌▐▌▝▜▌▐▌▝▜▌▐▛▀▀▘▐▛▀▚▖
    █ ▝▚▄▞▘▐▌ ▐▌  █ ▐▌ ▐▌▝▚▄▞▘▝▚▄▞▘▐▙▄▄▖▐▌ ▐▌

    """)
    open_browser = not args.no_browser
    if open_browser:
        threading.Thread(target=do_open_browser, args=(args.host, args.port)).start()

    uvicorn.run(
        "toktagger.api.cli:app", host=args.host, port=args.port, reload=args.reload
    )


class ProjectBuilder:
    def __init__(self, host: str = "localhost", port: int = 8002):
        self.base_url = f"http://{host}:{port}"

    def create_project(self, project: ProjectIn) -> str:
        response = requests.post(
            f"{self.base_url}/projects",
            json=project.model_dump(mode="json"),
        )
        if response.status_code != 200:
            raise RuntimeError(f"Failed to create project: {response.text}")
        project_id = response.json()["_id"]
        return project_id

    def create_samples(self, project_id: str, project: ProjectIn):
        samples: list[SampleIn] = []

        if project.data_loader.name == "parquet":
            path = Path(project.data_loader.file_path)
            path = path.expanduser().resolve()
            local_files = path.glob("*.parquet")
            shot_numbers = [f.stem for f in local_files]

            for shot_id in shot_numbers:
                data = TimeSeriesFileData(
                    file_name=str(path / f"{shot_id}.parquet"),
                    type=FileType.PARQUET,
                    protocol=FileProtocol.LOCAL,
                    column_names=project.tasks[0].signal_names,
                )
                sample = SampleIn(shot_id=int(shot_id), data=data)
                samples.append(sample)

        elif project.data_loader.name == "uda":
            shot_min = project.data_loader.shot_min
            shot_max = project.data_loader.shot_max

            for shot_id in range(shot_min, shot_max + 1):
                data = ShotData(
                    protocol=ShotProtocol.UDA,
                    signal_names=project.tasks[0].signal_names,
                )
                sample = SampleIn(shot_id=shot_id, data=data)
                samples.append(sample)

        response = requests.post(
            f"{self.base_url}/projects/{project_id}/samples",
            json=[sample.model_dump(mode="json") for sample in samples],
        )

        if response.status_code != 200:
            raise RuntimeError(f"Failed to create samples: {response.text}")

        print(
            f"Created project '{project.name}' with id {project_id} and {len(samples)} samples."
        )


def read_project_file(file_name: str) -> ProjectIn:
    with Path(file_name).open("rb") as fhandle:
        config = tomllib.load(fhandle)

    project = ProjectIn(**config["project"])
    return project


def read_annotations(file_name: str) -> list[SampleIn]:
    with Path(file_name).open("rb") as fhandle:
        config = json.load(fhandle)

    annotations = [SampleIn(**annotation) for annotation in config]
    return annotations


def create_project(file_name: str, host: str, port: int):
    project = read_project_file(file_name)

    creator = ProjectBuilder(host, port)
    project_id = creator.create_project(project)
    creator.create_samples(project_id, project)


def add_annotations(file_name: str, project_id: str, host: str, port: int):
    annotations = read_annotations(file_name)
    base_url = f"http://{host}:{port}"
    response = requests.post(
        f"{base_url}/projects/{project_id}/annotations",
        json=[annotation.model_dump(mode="json") for annotation in annotations],
    )
    if response.status_code != 200:
        raise RuntimeError(f"Failed to add annotations: {response.text}")
    print(f"Added {len(annotations)} annotations to project {project_id}.")


def main():
    argparser = argparse.ArgumentParser(description="Run the FastAPI application")
    argparser.add_argument("--host", default="localhost", help="Host to run the app on")
    argparser.add_argument(
        "--port", default=8002, type=int, help="Port to run the app on"
    )
    argparser.add_argument(
        "--no-browser", action="store_true", help="Don't open a browser"
    )
    argparser.add_argument(
        "--reload", action="store_true", help="Reload the API on changes"
    )

    subparsers = argparser.add_subparsers(dest="command")
    subparsers.required = False

    create_parser = subparsers.add_parser(
        "create", help="Create a new project from the CLI"
    )
    create_parser.add_argument(
        "file_name", help="Config file name to create project from."
    )

    add_parser = subparsers.add_parser(
        "add-annotations", help="Add annotations to a project from the CLI"
    )
    add_parser.add_argument(
        "file_name", help="JSON file name containing annotations to add."
    )
    add_parser.add_argument(
        "project_id", help="ID of the project to add annotations to."
    )

    args = argparser.parse_args()

    if args.command == "create":
        create_project(args.file_name, args.host, args.port)
    elif args.command == "add-annotations":
        add_annotations(args.file_name, args.project_id, args.host, args.port)
    else:
        run_toktagger(args)


if __name__ == "__main__":
    main()
