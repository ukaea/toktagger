# Deployment

This guide shows how to run TokTagger on a shared server with Docker Compose. The file `docker-compose.yml` is the production stack.

## What the stack contains

| Service | Purpose |
|---|---|
| `caddy` | Reverse proxy. It gets TLS certificates and it is the only service that publishes ports (80 and 443). |
| `api` | TokTagger, in the production image. It runs under Gunicorn. |
| `keycloak` | The identity provider. It keeps the user accounts. |
| `postgres` | The database of Keycloak. |
| `mongo` | The database of TokTagger. |

TokTagger uses the `oidc` provider in this stack. The managed Canaille server is not used. For the sign-in flow, read the [User Management](user_management.md) guide.

## Before you start

You need:

- A server with Docker and Docker Compose.
- Two DNS names that point to the server, for example `toktagger.example.com` and `auth.example.com`.
- Ports 80 and 443 open to the users. Caddy uses them to get and renew the certificates.

## Install

1. Copy the example settings:

    ```sh
    cp .env.example .env
    ```

2. Edit `.env`. Set the two host names. Replace each value marked `CHANGE` with a long random string. Use letters and digits only. You can make a string with `openssl rand -hex 32`.

    !!! warning
        You cannot change these values after the first start. The databases keep the first values in their volumes, and `docker compose down` does not remove the volumes. If you change a value and start the stack again, the stack stops working and it does not show a clear error. To change a value, stop the stack with `docker compose down -v`. This command deletes all your data.

3. Start the stack:

    ```sh
    docker compose up -d --build
    ```

    The first start takes some minutes. Keycloak imports the realm `toktagger` at the first start.

4. Open `https://<TOKTAGGER_HOST>` and make sure that the page loads.

## Create the first administrator

The realm has no users. Make the first user in Keycloak:

1. Open `https://<KEYCLOAK_HOST>`. Sign in with the user `admin` and the password `KEYCLOAK_ADMIN_PASSWORD`.
2. Select the realm `toktagger`.
3. Open **Users** and click **Add user**. Enter the user name and the email address.
4. Open the **Credentials** tab and set a password.
5. Open the **Groups** tab and add the user to `toktagger-admins`.

The user can now sign in to TokTagger as a global admin. To add other users, do the same steps without the group. See [User Management](user_management.md) for the roles.

## Settings

| Variable | Meaning |
|---|---|
| `TOKTAGGER_HOST` | The public name of TokTagger |
| `KEYCLOAK_HOST` | The public name of Keycloak |
| `AUTH_SECRET_KEY` | The key that signs the TokTagger sessions. All workers use the same key. |
| `KEYCLOAK_CLIENT_SECRET` | The secret of the Keycloak client `toktagger` |
| `KEYCLOAK_ADMIN_PASSWORD` | The password of the Keycloak administrator |
| `POSTGRES_PASSWORD` | The password of the Keycloak database |
| `MONGO_USERNAME`, `MONGO_PASSWORD` | The credentials of the TokTagger database |
| `SERVER_WORKERS` | The number of Gunicorn workers. The default is 4. |
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

## Data and backups

The stack keeps its data in these Docker volumes:

| Volume | Content |
|---|---|
| `mongo_data` | Projects, samples, annotations and users of TokTagger |
| `postgres_data` | The Keycloak accounts |
| `toktagger_data` | The TokTagger cache and the session signing key |
| `caddy_data` | The TLS certificates |

Back up `mongo_data` and `postgres_data` on a schedule.

## Update

```sh
git pull
docker compose up -d --build
```

## Test on one machine

Set `TOKTAGGER_HOST=localhost` and `KEYCLOAK_HOST=keycloak.localhost`. Caddy then makes certificates with its own authority, and the browser shows a warning. The script `scripts/compose_smoke_test.sh` starts the stack with these names and checks that the proxy, the sign-in redirect and the Keycloak issuer work. It removes the stack when it ends.

!!! warning
    The test names are for tests only. Use real DNS names and valid certificates for a shared server.

## Add test data

To make sure that the stack works, add test data with the setup scripts. The scripts write the data files into the `data/` folder of the repository, and the server must read these files. The file `docker-compose.test.yml` attaches this folder to the `api` container as read-only. Start the stack with the two files:

```sh
docker compose -f docker-compose.yml -f docker-compose.test.yml up -d --build
```

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
