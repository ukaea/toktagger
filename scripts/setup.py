import requests


def main():
    project = {
        "name": "Disruption Tagging Project",
        "task": "disruption",
        "query_strategy": "random",
        "data_loader": "uda",
    }

    response = requests.post(
        "http://localhost:8002/projects",
        json=project,
    )
    project_id = response.json()["_id"]
    samples = [
        {
            "project_id": project_id,
            "shot_id": 30421,
            "data": {
                "signal_names": ["ip", "ANE_DENSITY"],
                "protocol": "uda",
            },
        }
    ]
    response = requests.put(
        f"http://localhost:8002/projects/{project_id}/samples", json=samples
    )
    requests.put(f"http://localhost:8002/projects/{project_id}")
    print(project_id)

    project = {
        "name": "ELM Tagging Project",
        "task": "ELM",
        "query_strategy": "random",
        "data_loader": "parquet",
    }

    response = requests.post(
        "http://localhost:8002/projects",
        json=project,
    )
    project_id = response.json()["_id"]
    samples = [
        {
            "project_id": project_id,
            "shot_id": 30421,
            "data": {
                "file_name": "/data/elms/30421.parquet",
                "type": "parquet",
                "protocol": "file",
            },
        },
        {
            "project_id": project_id,
            "shot_id": 30458,
            "data": {
                "file_name": "/data/elms/30458.parquet",
                "type": "parquet",
                "protocol": "file",
            },
        },
        {
            "project_id": project_id,
            "shot_id": 30440,
            "data": {
                "file_name": "/data/elms/30440.parquet",
                "type": "parquet",
                "protocol": "file",
            },
        },
    ]
    response = requests.put(
        f"http://localhost:8002/projects/{project_id}/samples", json=samples
    )
    requests.put(f"http://localhost:8002/projects/{project_id}")
    print(project_id)


if __name__ == "__main__":
    main()
