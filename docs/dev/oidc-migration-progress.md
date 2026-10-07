# OIDC migration progress

## Phase 0: spike and dependency check

Status: done. Gate passed.

### Dependencies

- Added: `authlib>=1.8.0`, `httpx>=0.28.1` (moved from the dev group), `canaille[front,oidc,server,sqlite]>=0.2.7`, `joserfc>=1.6,<1.7`. Dev group: `respx`.
- `uv lock` resolves with the existing pins. `pytest tests/api` passes (639 passed, 27 skipped).
- **`joserfc` MUST stay below 1.7.** From 1.7.0, `Key.as_dict()` returns only the public key by default. Canaille 0.2.7 signs tokens with `jwk.as_dict()`, so the token endpoint returns HTTP 500 (`unsupported_key_operation: Invalid key_op 'sign' for public key`). 1.6.8 works.
- Canaille is a base dependency for now (open question 1 in the plan).

### Canaille facts

- `python -m canaille` does not work. Use the console script in the same directory as `sys.executable` (`Path(sys.executable).parent / "canaille"`).
- All CLI calls need `CANAILLE_CONFIG=<path to canaille.toml>`.
- `canaille config dump --path canaille.toml` writes a full commented config with these problems:
  - It contains empty `[CANAILLE.SMTP]` and `[CANAILLE.SMPP]` tables. The empty SMPP table makes Canaille fail with "SMPP server configured but the 'sms' extra is not installed". Remove both tables, or render the config from our own template instead of dumping.
  - `ACTIVE_JWKS` holds public keys only. Generate a private RSA key (`joserfc.jwk.RSAKey.generate_key(2048, auto_kid=True).as_dict(private=True)`) and write it as a TOML inline table (`{n = "...", e = "...", d = "...", ...}`). `json.dumps` output is not valid TOML.
- Config keys that matter (top level, before any table):
  - `SECRET_KEY`
  - `SERVER_NAME = "localhost:8003"` (the issuer is `{PREFERRED_URL_SCHEME}://{SERVER_NAME}`)
  - `PREFERRED_URL_SCHEME = "http"`
- `[CANAILLE_SQL] DATABASE_URI = "sqlite:////abs/path/canaille.sqlite"` (the key is `DATABASE_URI`, not `SQL_DATABASE_URI`).
- `[CANAILLE_OIDC.USERINFO_MAPPING] PREFERRED_USERNAME = "{{ user.user_name }}"`. The default maps `preferred_username` to `display_name`, which is empty for CLI-created users.
- No broker is needed (`BROKER` defaults to the eager broker). No SMTP is needed.
- Commands, in order:
  1. `canaille install` (creates the SQLite schema)
  2. `canaille create user --user-name admin --password <pw> --emails admin@localhost --given-name .. --family-name .. --formatted-name ..`
  3. `canaille create group --display-name toktagger-admins --members admin` (`--members` accepts a user name)
  4. `canaille create client --client-id toktagger --client-secret <secret> --client-name TokTagger --client-uri <public_url> --redirect-uris <public_url>/auth/callback --post-logout-redirect-uris <public_url>/ui/login --grant-types authorization_code --grant-types refresh_token --response-types code --scope "openid profile email groups" --token-endpoint-auth-method client_secret_basic --audience toktagger`
  5. `canaille run --bind 127.0.0.1:8003`
  - Repeated options (`--grant-types`) append to a list.
  - To change a client later: `canaille set client toktagger --redirect-uris ...`. `set client` takes the client id as its argument.
- `--audience toktagger` makes the `aud` claim of access tokens and ID tokens contain `toktagger`. Without it `aud` is `[]`. Bearer verification therefore keeps `aud` checking on.
- Consent: no consent screen appeared. Canaille trusts a client when its `client_uri` host matches `CANAILLE_OIDC.TRUSTED_DOMAINS` (default `[".localhost", "127.0.0.1"]`). For a non-localhost `public_url`, set `TRUSTED_DOMAINS` to the host of `public_url`.
- Discovery (`/.well-known/openid-configuration`) works. It lists `end_session_endpoint` (`/oauth/end_session`), `jwks_uri`, `S256` PKCE, and a `groups` claim.
- ID token and `/userinfo` both contain `groups: ["toktagger-admins"]` and `preferred_username`, `email`, `name`. Group names are plain, with no leading `/`.
- Access tokens are RS512 JWTs. They carry the same user claims as the ID token (including `groups`), `iss`, `aud`, `exp`, and no `azp`.
- `/oauth/end_session?client_id=..&post_logout_redirect_uri=..` shows a "Do you want to log out?" page with Stay logged / Logout buttons. One extra click is needed.
- Canaille's login is two steps: `input[name=login]` then `input[name=password]` (both submitted with Enter).
- Admin rights in Canaille: the default `[CANAILLE.ACL.ADMIN]` FILTER is `[{user_name = "admin"}, {groups = "admin"}]`. Setting `FILTER = [{groups = "toktagger-admins"}]` was verified: `/users`, `/groups`, `/admin/client` load for a member of that group. The profile page is `/profile/<user_name>`.
- Process note: `canaille run` starts a child process. Stopping it needs a signal to the whole process group, or a check that the port is free afterwards.

## Phase 1: configuration

Status: done.

- `Auth` gained the OIDC fields from the plan plus `canaille_bootstrap_password` (used for deterministic e2e logins).
- Defaults for `public_url` and `canaille_public_url` cannot live on `Auth`, because `Auth` cannot see `Server` and the CLI changes host and port after load. They are `Settings.public_url` and `Settings.canaille_public_url` properties, computed on use, without a trailing slash.
- `Server.cors_origins` is added in Phase 2, with the CORS wiring. `forwarded_allow_ips` and `gunicorn_timeout` are added in Phase 7.
- `uv run --all-extras pytest tests/api` was not run for this phase (config-only change; the models extra is not touched). Run it before the final PR.

## Phase 2: backend OIDC (3 commits)

Status: done (API side). Frontend and e2e still use password login until Phases 3 and 5, so `tests/end_to_end` is broken on this branch until then.

Decisions and deviations:
- Provisioning keys users on (`oidc_issuer`, `oidc_sub`). The issuer is taken from discovery metadata, not from config.
- Legacy adoption runs inside provisioning (`crud.utils.adopt_legacy_user`). It sets `hashed_password` to None, because mongita has no `$unset`. Users with no `oidc_sub` are otherwise left alone.
- `/auth/logout` now returns 200 `{logout_url}` (was 204).
- Bearer auth uses `HTTPBearer` instead of `OAuth2PasswordBearer`.
- `require_password_changed` was the only auth dependency on 7 routers, so it was replaced by `get_current_user`, not deleted.
- Role editing is removed from `PUT /users/{id}`, which is admin-only and takes only `is_active`. Kept: admin cannot deactivate self; last active admin cannot be deactivated or deleted (lock `users:admins`).
- `lifespan` raises when no issuer is configured. Phase 3 sets the issuer before workers start.
- The flow cookie `tt_oidc_flow` is scoped to path `/auth`, max age 600 s.
- Authlib's async client uses `httpx2`; `oidc.IDP_ERRORS` covers both httpx and httpx2 errors.
- JWKS refresh on unknown `kid` is limited to once per 30 s.
- Tests: deleted `test_first_run.py`, the six password tests in `test_core.py`, `/auth/token` tests in `routers/test_auth.py`, create/password/held/role-edit tests in `routers/test_users.py`, `get_user_doc_by_username`/password tests in `crud/test_utils.py`, the "held" role in `test_endpoint_guards.py`, and the user-creation reserved-prefix tests (ported to provisioning). `get_auth_token(username)` now mints a session token.
- Not done: unique index on (`oidc_issuer`, `oidc_sub`); the lock covers it.
- `models` extra: `uv run --all-extras pytest tests/api` passes (710 passed, 27 skipped).

## Phase 3: managed Canaille

Status: done for the backend and test fixtures. `tests/end_to_end` still fails until Phase 5, because the built UI still validates `/auth/me` against a schema that requires `must_change_password` and shows the old login form. Sign-in through Canaille itself works in the e2e fixtures.

Decisions and deviations:
- The Canaille config is rendered from our own template on every start, not from `canaille config dump`. A minimal config is enough. `[CANAILLE.ACL.DEFAULT]` must exist as an empty table: without it nobody has `use_oidc` and sign-in returns 403.
- Secret key and private JWK are stored in `keys.json` (0600), not in `client.json`. `client.json` holds client id, secret and the `public_url` the client was registered with.
- `create client --audience` does not resolve. Use `set client <id> --audience <id>` after creating the client.
- `create user --groups <display name>` works and `get group` shows the membership. The admin group is created first, then the admin user joins it.
- A failed first provisioning deletes the SQLite file and `client.json`, so the next start retries from clean.
- Canaille runs in its own session (`start_new_session`) and is stopped with SIGTERM to its process group, then SIGKILL after 5 s.
- `managed_idp()` installs a SIGTERM handler for its duration so `kill`/`docker stop` also stop Canaille. `run_with_gunicorn` terminates gunicorn on SystemExit.
- `start()` refuses a port already in use. A stale Canaille from a killed process shows up here.
- `Settings.public_url` and `canaille_public_url` map host `0.0.0.0` to `localhost`.
- Known Canaille 0.2.7 limitation: two sign-ins by one user in the same second produce an identical access token and a 500 (`UNIQUE constraint failed: token.access_token`), which TokTagger reports as `?error=idp_unavailable`. The e2e helper `tests/identity.py::session_cookies` signs each user in once.
- On macOS, forking after the parent used the system proxy lookup crashes the child. The e2e fixture sets `no_proxy=localhost,127.0.0.1`; the readiness probe uses `trust_env=False`.
- e2e fixtures sign in over plain HTTP (`tests/identity.py`), not with Playwright. A Playwright sign-in test comes with the Phase 5 login test.
- `endpoints.create_user(username, password, role)` creates the Canaille user, signs in once to provision the TokTagger user, and returns its id. The `must_change_password` argument is gone.
- Gate checked by hand with `python -m toktagger.api.cli` on an empty cache dir: banner printed once, login redirects to Canaille, restart reuses the database without a banner, `--workers 2` works, SIGTERM leaves no listeners.
- `uv run` uses the installed copy of `toktagger`, not the working tree, when a script is run from another directory. Use `PYTHONPATH=.`.

## Phase 4: Keycloak dev stack and docs

Status: done.

Decisions and deviations:
- Keycloak is pinned to 26.8.0 and starts with `start-dev --import-realm`. The realm file `deploy/keycloak/toktagger-realm.dev.json` takes the client secret from `${KEYCLOAK_CLIENT_SECRET}`.
- Issuer hostname: `KC_HOSTNAME=http://localhost:8080` with `KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true`. The issuer and browser endpoints use `localhost:8080`. Token and JWKS endpoints use `keycloak:8080` inside the Docker network.
- The "Manage account" link is built from the issuer in the discovery metadata, not from `issuer_url`, so a container setup does not show `keycloak:8080` to the browser. The link is only given for issuers that contain `/realms/`.
- Keycloak sets `Secure` cookies on plain HTTP, so Python `requests` cannot sign in. Verification used a real browser (Playwright) against the stack: admin is `admin`, a user outside the group is `user`, the account link and the logout URL work.
- `docker-compose.dev.yml`: the Mongo volume path is `/data/db`; `api` waits for a healthy Keycloak.
- Docs: `user_management.md` rewritten; `configuration.md` has the new `auth` fields and `server.cors_origins`; `index.md`, `README.md` updated; `user_management.md` added to the nav in `zensical.toml`.

## Phase 5: frontend

Status: done.

- Login page: one Sign In button, error messages for `?error=` codes, `return_to` support. `RequireAuth` and `RequireAdmin` redirect to `/ui/login?return_to=`.
- `AuthContext.login(returnTo)` navigates to `/auth/login`; `logout` follows the `logout_url` from the server.
- Profile page: read-only data and a Manage account link from `/auth/config`. Admin users page: no create, role edit or password reset; read-only role.
- `password.tsx` deleted; `CurrentUserSchema` has no `must_change_password`.
- `tsc --noEmit` reports 24 errors on this branch and before it. None is in the changed files.
- e2e: login, profile, admin users and unauthorized-access tests rewritten; a real Playwright sign-in through Canaille is tested. Canaille's same-second token collision applies here too, so the regular-user sign-in test uses a user that was not signed in by a helper.
- `test_profile2d_edit_mode_relabel_and_delete` fails on `slj/multi-user-support` too (checked in a worktree).
- `toktagger/api/static` is CI-built, so the local build output was not committed.

## Phase 6: audit and script tokens

Status: done.

- `scripts/setup.py` and `scripts/create_mock_data.py` read `TOKTAGGER_API_TOKEN`. The username, password and password-change code is removed.
- The grep for password symbols finds only the legacy-user adoption in `crud/utils.py` and its tests, and the test that `/auth/token` is gone.
- The stale `POST /auth/token` entry is removed from the public-route test.
- Open question: the managed Canaille client has only the authorization-code and refresh grants. A script has no easy way to get an access token from it.
- Results: ruff clean; 675 passed, 28 skipped without the models extra; 736 passed, 23 skipped with it.

## Phase 7: production Docker

### Commit A: code and Dockerfile

- `server.forwarded_allow_ips` (default `127.0.0.1`) and `server.gunicorn_timeout` (default 120) are wired into Gunicorn (`--forwarded-allow-ips`, `--timeout`, `--graceful-timeout`) and uvicorn. `warn_if_insecure()` warns about plain-HTTP `public_url` on a non-local host.
- New multi-stage `Dockerfile` (`ui`, `builder`, `dev`, `production`). `api.dockerfile` is deleted. `docker-compose.dev.yml` builds the `dev` target.
- Verified: `docker build --target production .` builds. The container starts Canaille, passes the healthcheck, serves `/ui/login` and runs as uid 10001. The first build installed without `uv.lock` and got SQLAlchemy 2.1, which breaks `sqlalchemy-utils`. The Dockerfile now uses `uv sync --frozen`.
- Tests: ruff clean; `tests/api` passes (a stale-`settings` import in the new launch tests was fixed).

### Next

Commit B: production `docker-compose.yml`, `.env.example`, `deploy/`, `docs/deployment.md`, smoke test, CI step.
