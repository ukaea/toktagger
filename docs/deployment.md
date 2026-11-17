# Deployment

This guide shows how to run TokTagger on a shared server with Docker Compose. The file `docker-compose.yml` runs TokTagger with an existing OpenID Connect identity provider (IdP). Add `docker-compose.keycloak.yml` to run a bundled Keycloak provider and its Postgres database instead.

## What the stack contains

| Service | Purpose |
|---|---|
| `caddy` | Reverse proxy. It gets TLS certificates and it is the only service that publishes ports (80 and 443). |
| `api` | TokTagger, in the production image. It runs under uvicorn. |
| `keycloak` | Optional bundled identity provider. It keeps the user accounts. |
| `postgres` | Optional database of Keycloak. |
| `mongo` | The database of TokTagger. |

TokTagger uses the `oidc` provider in this stack. The managed Canaille server is not used. For the sign-in flow, read the [User Management](user_management.md) guide.

## Before you start

You need:

- A server with Docker and Docker Compose.
- A DNS name that points to the server, for example `toktagger.example.com`. Bundled Keycloak needs a second name, for example `auth.example.com`.
- Ports 80 and 443 open to the users. Caddy uses them to get and renew the certificates.

## Install

1. Copy the example for your authentication option to `.env`:

    ```sh
    # Existing OpenID Connect provider
    cp .env.example .env

    # OR bundled Keycloak and Postgres
    cp .env.keycloak.example .env
    ```

    Each example selects the required Compose files through `COMPOSE_FILE`. The Keycloak example chains the core file and the Keycloak overlay; the overlay is not a standalone stack.

2. Edit `.env`. Set `TOKTAGGER_HOST`, `AUTH_SECRET_KEY` and `MONGO_PASSWORD`, then complete the settings for your chosen option:

    **Bundled Keycloak (`.env.keycloak.example`):** Set `KEYCLOAK_HOST`, `KEYCLOAK_CLIENT_SECRET`, `KEYCLOAK_ADMIN_PASSWORD` and `POSTGRES_PASSWORD`.

    **Existing IdP (`.env.example`):** Set `AUTH_ISSUER_URL`, `AUTH_CLIENT_ID` and `AUTH_CLIENT_SECRET`. Configure a confidential OIDC client using the [identity provider checklist](user_management.md#use-keycloak-or-another-identity-provider), with these URLs:

    - Sign-in callback: `https://<TOKTAGGER_HOST>/auth/callback`
    - Sign-out redirect: `https://<TOKTAGGER_HOST>/ui/login`

    The API container must be able to reach the issuer URL, and users must be able to reach the provider's public endpoints. Configure the groups claim and admin group as described in the checklist. Use `AUTH_SCOPES`, `AUTH_ROLES_CLAIM` and `AUTH_ADMIN_GROUP` if your provider needs different values.

    Generate random secrets with `openssl rand -hex 32`. Use letters and digits only for database passwords. For an existing IdP, use the client secret issued by that provider.

    !!! warning
        Database credentials and the imported Keycloak client settings persist in their volumes. Changing `.env` alone does not update them. Use the database or Keycloak administration tools to rotate them. `docker compose down -v` resets the stack but **deletes all your data**.

3. Start the stack:

    ```sh
    docker compose up -d --build
    ```

    Compose reads `COMPOSE_FILE` from `.env`. With bundled Keycloak, the first start takes some minutes and imports the realm `toktagger`.

4. Open `https://<TOKTAGGER_HOST>` and make sure that the page loads.

### Select files on the command line

Instead of setting `COMPOSE_FILE`, you can select the files explicitly. The `-f` options override `COMPOSE_FILE`:

```sh
# Existing IdP: only Caddy, TokTagger and MongoDB
docker compose -f docker-compose.yml up -d --build

# Bundled Keycloak: also start Keycloak and Postgres
docker compose -f docker-compose.yml -f docker-compose.keycloak.yml up -d --build
```

Use the same file selection for `down`, `logs`, updates and other Compose commands. On Windows, use `;` instead of `:` in `COMPOSE_FILE`.

If upgrading an existing bundled deployment, add `COMPOSE_FILE=docker-compose.yml:docker-compose.keycloak.yml` to your existing `.env` before starting it. Keep the same Compose project name and volumes to preserve your data.

## Create the first administrator

For an existing IdP, assign your administrator to the configured admin group in that provider.

For bundled Keycloak, the realm has no users. Make the first user in Keycloak:

1. Open `https://<KEYCLOAK_HOST>`. Sign in with the user `admin` and the password `KEYCLOAK_ADMIN_PASSWORD`.
2. Click **Manage Realms**, then select the realm `toktagger`.
3. Open **Users** and click **Create new user**. Enter the user name and the email address.
4. Open the **Credentials** tab and set a password.
5. Open the **Groups** tab and add the user to `toktagger-admins`.

The user can now sign in to TokTagger as a global admin. To add other users, do the same steps without the group. See [User Management](user_management.md) for the roles.

## Settings

| Variable | Meaning |
|---|---|
| `TOKTAGGER_HOST` | The public name of TokTagger |
| `COMPOSE_FILE` | `docker-compose.yml` for an existing IdP; add `:docker-compose.keycloak.yml` for bundled Keycloak |
| `AUTH_ISSUER_URL` | Existing IdP's issuer URL, including its realm or tenant path if applicable |
| `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET` | Existing IdP's confidential client credentials |
| `AUTH_SCOPES` | OIDC scopes. Default: `openid profile email` |
| `AUTH_ROLES_CLAIM` | Groups claim, optionally a dotted path. Default: `groups` |
| `AUTH_ADMIN_GROUP` | Group granting global admin access. Default: `toktagger-admins` |
| `KEYCLOAK_HOST` | Bundled Keycloak only: its public name |
| `AUTH_SECRET_KEY` | The key that signs the TokTagger sessions. All workers use the same key. |
| `KEYCLOAK_CLIENT_SECRET` | Bundled Keycloak only: the secret of the client `toktagger` |
| `KEYCLOAK_ADMIN_PASSWORD` | Bundled Keycloak only: the password of the Keycloak administrator |
| `POSTGRES_PASSWORD` | Bundled Keycloak only: the password of the Keycloak database |
| `MONGO_USERNAME`, `MONGO_PASSWORD` | The credentials of the TokTagger database |
| `MONGO_VERSION` | The tag of the `mongo` image. The default is `8.0`. MongoDB 8.x does not start on Linux kernels 6.19 to 7.0.13 (see [SERVER-125742](https://jira.mongodb.org/browse/SERVER-125742)). On these kernels, set `7.0` before the first start. You cannot go back to an older version after MongoDB writes data to the volume. |
| `SERVER_WORKERS` | The number of uvicorn workers. The default is 4. |
| `TOKTAGGER_EXTRAS` | Set to `models` to install the optional machine learning packages in the image |

The `api` service sets `SERVER_FORWARDED_ALLOW_IPS` to `*`. Only Caddy can reach the `api` service, so this is safe. Do not publish the port of the `api` service.

## Machine learning workers

When `TOKTAGGER_EXTRAS` is `models`, TokTagger starts Ray workers. The workers train models, load weights and make predictions. The server writes the predictions to the database when each task ends.

Each worker has an internal token. The token can only update the status and the progress of a model. It cannot read projects, and it cannot change samples, annotations or users.

Code runs in a worker when a weights file uses `pickle`. This code can read the data that the worker loads, and it can send a wrong model status. To decrease this risk on a shared server, do these steps:

1. Set `MODELS_LOAD_SAFETENSORS_ONLY=true`. Then the workers do not load `pickle` files.
2. Set `MODELS_LOCAL_LOAD_ENABLED=false`. The default is `true`.
3. Keep the Ray workers on the same host as the `api` service. If a worker is on a different host, use TLS between the worker and the API. The token goes in each request.

For the model settings, read [Configuration](configuration.md).

## Add custom data loaders and models

The production stack in `docker-compose.yml` runs the `api` service from the image `toktagger:latest`. That image does not contain your [custom data loaders](custom_dataloaders.md) or [custom models](custom_models.md). To add them, make a new image from `toktagger:latest`, and use a Compose override file to run your script in the `api` service.

### Step 1: Put your files in one folder

Make a folder `custom` next to `docker-compose.yml`. Put your modules and the script that starts the server in it. For example, for the database loader in [Custom Data Loaders](custom_dataloaders.md#example-database-loader):

```
custom/
├── Dockerfile
├── loader.py
├── run.py
└── settings.py
```

You do not need to set the host or the port in `run.py`. The image sets `SERVER_HOST=0.0.0.0` and `SERVER_PORT=8002`.

### Step 2: Write the Dockerfile

```dockerfile title="custom/Dockerfile"
FROM toktagger:latest

USER root
# Install the packages that your code needs
RUN pip --python /opt/venv/bin/python install --no-cache-dir sqlalchemy
COPY . /opt/custom
USER toktagger

CMD ["python", "/opt/custom/run.py"]
```

If your code needs no other packages, remove the `RUN` line.

### Step 3: Write the Compose override file

```yaml title="docker-compose.custom.yml"
services:
  api:
    build: !override
      context: ./custom
    image: toktagger-custom:latest
    environment:
      SQL_URL: ${SQL_URL:?}
```

Add the settings of your code to `environment`, and add their values to `.env`. For example, add `SQL_URL=<Your URL>` to `.env`.

### Step 4: Start the stack

Build the TokTagger image first. Your image starts from it. For custom models, set `TOKTAGGER_EXTRAS=models` in `.env` before you build:

```sh
docker compose build api
# Bundled Keycloak; omit its file when using an existing IdP.
docker compose -f docker-compose.yml -f docker-compose.keycloak.yml -f docker-compose.custom.yml up -d --build
```

Do these two steps again after each update of TokTagger.

!!! warning
    `run.py` starts the server with `server.run()`, which uses one Uvicorn process. The stack ignores `SERVER_WORKERS` for this server. Uvicorn workers import `toktagger.api.cli:create_app` and do not import your script, so they do not know your data loaders or models.

## Data and backups

The stack keeps its data in these Docker volumes:

| Volume | Content |
|---|---|
| `mongo_data` | Projects, samples, annotations and users of TokTagger |
| `postgres_data` | The Keycloak accounts (bundled Keycloak only) |
| `toktagger_data` | The TokTagger cache and the session signing key |
| `caddy_data` | The TLS certificates |

Back up `mongo_data` and, when using bundled Keycloak, `postgres_data` on a schedule.

## Update

```sh
git pull
docker compose up -d --build
```

## Test on one machine

For bundled Keycloak, set `TOKTAGGER_HOST=localhost` and `KEYCLOAK_HOST=keycloak.localhost`. Caddy then makes certificates with its own authority, and the browser shows a warning. The script `scripts/compose_smoke_test.sh` starts the stack with these names and checks that the proxy, the sign-in redirect and the Keycloak issuer work. It removes the stack when it ends.

!!! warning
    The test names are for tests only. Use real DNS names and valid certificates for a shared server.

## Add test data

To make sure that the stack works, add test data with the setup scripts. The scripts write the data files into the `data/` folder of the repository, and the server must read these files. The file `docker-compose.test.yml` attaches this folder to the `api` container as read-only. Start the bundled Keycloak stack with all three files:

```sh
docker compose -f docker-compose.yml -f docker-compose.keycloak.yml -f docker-compose.test.yml up -d --build
```

For an existing IdP, omit `-f docker-compose.keycloak.yml`. Explicit `-f` options replace the file selection in `.env`.

!!! warning
    Use `docker-compose.test.yml` only for tests. Do not attach the repository to a shared server.

Then sign in to TokTagger and make an API token (read [User management](user_management.md)). Then send the HTTPS address of TokTagger with `--url`.

On a server with a valid certificate:

```sh
TOKTAGGER_API_TOKEN=<API token> python scripts/create_mock_data.py --url https://<TOKTAGGER_HOST>
```

On one machine, Caddy signs the certificate with its own authority, and Python does not trust that authority. Copy the root certificate of Caddy from the container, and give it to Python with `REQUESTS_CA_BUNDLE`:

```sh
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt caddy-root.crt
REQUESTS_CA_BUNDLE=caddy-root.crt TOKTAGGER_API_TOKEN=<API token> python scripts/create_mock_data.py --url https://localhost
```

`scripts/setup.py` uses the same options.
