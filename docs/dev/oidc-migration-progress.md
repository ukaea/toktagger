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

### Next

Phase 2, commit 1: schemas, CRUD and legacy-user migration.
