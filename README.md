# TokTagger

An interactive annotation platform for Tokamak diagnostic data.

[![Workflow: CI](https://github.com/ukaea/viz-annotation/actions/workflows/ci.yml/badge.svg)](https://github.com/ukaea/viz-annotation/actions/workflows/ci.yml)
[![Workflow: Dependabot](https://img.shields.io/badge/Dependabot-enabled-34d058?logo=github)](https://github.com/ukaea/viz-annotation/actions/workflows/dependabot/dependabot-updates)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Linting: ruff](https://img.shields.io/badge/linting-ruff-purple)](https://github.com/astral-sh/ruff)
[![Testing: pytest](https://img.shields.io/badge/testing-pytest-red)](https://github.com/pylint-dev/pylint-pytest)


## Quick Start

You run the application locally through a simple pip install:

```sh
GIT_LFS_SKIP_SMUDGE=1 pip install git+https://github.com/ukaea/viz-annotation.git
```

Then run:

```sh
toktagger
```

This will start a local instance of the application running at `http://localhost:8002`.


## Project Overview

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

## Development Setup

### Installation

1. Install and setup `git lfs`: https://git-lfs.com/
2. Create a new python environment and install the dependancies

```sh
uv venv --python 3.12.6 
source .venv/bin/activate
uv pip install -e .
```

2. Install the UI dependencies

```sh
nvm use v22.19.0
npm --prefix services/ui run install
```

3. Run the backend API service in development mode. The backend API will be accessible at `http://localhost:8002`.

```sh
uvicorn services.api.main:app --host 0.0.0.0 --port 8002 --reload
```

4. Run the frontend UI service in development mode. The UI will be accessible at `http://localhost:5173`
```sh
npm --prefix services/ui run dev
```

### Development Setup with Docker

Alternatively, you can run the application in development mode using docker:

```sh
docker compose --env-file .env.dev -f docker-compose.dev.yml up --build
```

This will start both the backend API and the frontend UI at the following urls:

| Service URL                     | Description                |
|---------------------------------|----------------------------|
| `http://localhost:5173/`        | User Interface             |
| `http://localhost:8002/`        | Backend API                |
| `http://localhost:27017/`       | MongoDB Database           |
| `http://localhost:8081/`        | MongoExpress Admin Panel   |

The development setup runs both the frontend and backend in development mode, so any changes to the code will automatically be reflected in the running application.

### Setup local test data
Once the application is running, the following setup script can be used to automatically set up a basic model

Configure git LFS and pull the model

```sh
git lfs install
git lfs pull
```

Create some example datasets for testing.
```sh
python -m scripts.setup 
```

### Building the Single Page Application (SPA)

The version of the application which get served to users is built using the following command:

```sh
npm --prefix services/ui run build
```

This will run vite build and create a production-ready version of the application in the `services/api/static` directory. This is then packaged with the application when pip installed.
