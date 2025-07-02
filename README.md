
# Overview

Below is a high level overview of the project structure:
```
.
├── data                # Sample experimental data
├── active_learning     # Experiments in active learning
├── notebooks           # Notebooks for exploring data
├── services            # Implementations of different apis/services
│   ├── api             # API: backend for pulling data, annotations, running models.
│   └── ui              # UI: the react front end of the application
├── README.md           # This README doc
└── docker-compose.yml  # Master docker compose for running the application
```


# Development Setup

## Installation

1. Install `docker` and `docker compose`: https://docs.docker.com/engine/install/
2. Install and setup `git lfs`: https://git-lfs.com/

## Run

Run the application by running the following command:

```sh
docker compose --env-file .env.dev up --build
```

This will start the following services:

| Service URL                     | Description                |
|---------------------------------|----------------------------|
| `http://localhost:3001/`        | User Interface             |
| `http://localhost:8002/`        | Backend API                |
| `http://localhost:8081/`        | MongoExpress Admin Panel   |

## Setup local data
Once the application is running, the following setup script can be used to automatically set up a basic model

Configure git LFS and pull the model
```sh
git lfs install
git lfs pull
```

Build the relevant dataset for the ML model locally
```sh
uv venv --python 3.12.6 
source .venv/bin/activate
uv pip install -r ./scripts/requirements.txt
python -m scripts.setup 
```
