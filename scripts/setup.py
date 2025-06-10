import requests


def main():
    project = {
        "name": "string",
        "task": "ELM",
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
                "signal_names": ["ip"],
                "protocol": "uda",
            },
        }
    ]
    response = requests.put(
        f"http://localhost:8002/projects/{project_id}/samples", json=samples
    )
    requests.put(f"http://localhost:8002/projects/{project_id}")
    print(project_id)


if __name__ == "__main__":
    main()
