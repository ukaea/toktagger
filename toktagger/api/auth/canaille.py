import atexit
import json
import logging
import os
import secrets
import signal
import socket
import subprocess
import sys
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlparse

import httpx
from filelock import FileLock
from joserfc.jwk import RSAKey

from toktagger.api import config

logger = logging.getLogger(__name__)

ADMIN_USERNAME = "admin"
READY_TIMEOUT_SECONDS = 20
STOP_TIMEOUT_SECONDS = 5
CANAILLE_SCOPE = "openid profile email groups"

CONFIG_TEMPLATE = """\
SECRET_KEY = "{secret_key}"
SERVER_NAME = "{server_name}"
PREFERRED_URL_SCHEME = "{scheme}"
BROKER = "dramatiq_eager_broker:EagerBroker"

[CANAILLE]
DATABASE = "sql"

[CANAILLE.ACL.DEFAULT]

[CANAILLE.ACL.ADMIN]
PERMISSIONS = ["manage_oidc", "manage_users", "manage_all_groups", "delete_account", "impersonate_users"]
WRITE = ["groups", "lock_date"]
FILTER = [{{groups = "{admin_group}"}}]

[CANAILLE_SQL]
DATABASE_URI = "sqlite:///{database_path}"

[CANAILLE_OIDC]
ACTIVE_JWKS = [{jwk}]
TRUSTED_DOMAINS = ["{trusted_domain}"]

[CANAILLE_OIDC.USERINFO_MAPPING]
PREFERRED_USERNAME = "{{{{ user.user_name }}}}"
"""


def _toml_inline_table(values: dict[str, str]) -> str:
    return "{" + ", ".join(f'{key} = "{value}"' for key, value in values.items()) + "}"


def _write_private_file(path: Path, content: str) -> None:
    descriptor = os.open(path, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w") as handle:
        handle.write(content)


def _canaille_executable() -> Path:
    return Path(sys.executable).parent / "canaille"


class ManagedCanaille:
    """A Canaille OpenID Connect server that TokTagger provisions and runs for you."""

    def __init__(self) -> None:
        self.directory = Path(config.settings.server.cache_dir) / "canaille"
        self.config_path = self.directory / "canaille.toml"
        self.database_path = self.directory / "canaille.sqlite"
        self.keys_path = self.directory / "keys.json"
        self.client_path = self.directory / "client.json"
        self.marker_path = self.directory / "provisioned"
        self.log_path = self.directory / "canaille.log"
        self._process: subprocess.Popen | None = None

    @property
    def issuer_url(self) -> str:
        return config.settings.canaille_public_url

    def _cli(self, *arguments: str) -> str:
        environment = {**os.environ, "CANAILLE_CONFIG": str(self.config_path)}
        result = subprocess.run(
            [str(_canaille_executable()), *arguments],
            env=environment,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"canaille {' '.join(arguments[:2])} failed: {result.stderr.strip()}"
            )
        return result.stdout

    def _load_keys(self) -> dict[str, object]:
        if self.keys_path.exists():
            return json.loads(self.keys_path.read_text())
        keys = {
            "secret_key": secrets.token_hex(32),
            "jwk": RSAKey.generate_key(2048, auto_kid=True).as_dict(private=True),
        }
        _write_private_file(self.keys_path, json.dumps(keys))
        return keys

    def _render_config(self) -> None:
        keys = self._load_keys()
        issuer = urlparse(self.issuer_url)
        public = urlparse(config.settings.public_url)
        content = CONFIG_TEMPLATE.format(
            secret_key=keys["secret_key"],
            server_name=issuer.netloc,
            scheme=issuer.scheme,
            admin_group=config.settings.auth.admin_group,
            database_path=self.database_path,
            jwk=_toml_inline_table(keys["jwk"]),  # type: ignore[arg-type]
            trusted_domain=public.hostname,
        )
        _write_private_file(self.config_path, content)

    def _client_arguments(self) -> list[str]:
        public_url = config.settings.public_url
        return [
            "--client-uri",
            public_url,
            "--redirect-uris",
            f"{public_url}/auth/callback",
            "--post-logout-redirect-uris",
            f"{public_url}/ui/login",
        ]

    def _provision(self) -> None:
        auth = config.settings.auth
        password = auth.canaille_bootstrap_password or secrets.token_urlsafe(12)
        client_secret = secrets.token_urlsafe(32)
        self._cli("install")
        self._cli("create", "group", "--display-name", auth.admin_group)
        self.create_user(ADMIN_USERNAME, password, groups=(auth.admin_group,))
        self._cli(
            "create",
            "client",
            "--client-id",
            auth.client_id,
            "--client-secret",
            client_secret,
            "--client-name",
            "TokTagger",
            "--grant-types",
            "authorization_code",
            "--grant-types",
            "refresh_token",
            "--response-types",
            "code",
            "--scope",
            CANAILLE_SCOPE,
            "--token-endpoint-auth-method",
            "client_secret_basic",
            *self._client_arguments(),
        )
        self._cli("set", "client", auth.client_id, "--audience", auth.client_id)
        _write_private_file(
            self.client_path,
            json.dumps(
                {
                    "client_id": auth.client_id,
                    "client_secret": client_secret,
                    "public_url": config.settings.public_url,
                }
            ),
        )
        self.marker_path.touch()
        print(
            "\n"
            "  First start: a local identity provider (Canaille) was created.\n"
            f"    Address:  {self.issuer_url}\n"
            f"    Username: {ADMIN_USERNAME}\n"
            f"    Password: {password}\n"
            f"  Change the password at {self.issuer_url}/profile/{ADMIN_USERNAME}\n",
            flush=True,
        )

    def ensure_provisioned(self) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)
        with FileLock(self.directory / "provision.lock", timeout=120):
            self._render_config()
            if not self.marker_path.exists():
                try:
                    self._provision()
                except Exception:
                    self.database_path.unlink(missing_ok=True)
                    self.client_path.unlink(missing_ok=True)
                    raise
            else:
                self._update_client_urls()

    def _update_client_urls(self) -> None:
        record = json.loads(self.client_path.read_text())
        public_url = config.settings.public_url
        if record["public_url"] == public_url:
            return
        self._cli("set", "client", record["client_id"], *self._client_arguments())
        record["public_url"] = public_url
        _write_private_file(self.client_path, json.dumps(record))

    def create_user(
        self,
        username: str,
        password: str,
        email: str | None = None,
        groups: tuple[str, ...] = (),
    ) -> None:
        group_arguments = [arg for group in groups for arg in ("--groups", group)]
        self._cli(
            "create",
            "user",
            "--user-name",
            username,
            "--password",
            password,
            "--emails",
            email or f"{username}@localhost",
            "--formatted-name",
            username,
            *group_arguments,
        )

    def credentials(self) -> tuple[str, str]:
        record = json.loads(self.client_path.read_text())
        return record["client_id"], record["client_secret"]

    def _port_in_use(self) -> bool:
        port = config.settings.auth.canaille_port
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.settimeout(0.5)
            return probe.connect_ex((config.settings.server.host, port)) == 0

    def start(self) -> None:
        if self._port_in_use():
            raise RuntimeError(
                f"Port {config.settings.auth.canaille_port} is already in use. "
                "Change auth.canaille_port or stop the other process."
            )
        bind = f"{config.settings.server.host}:{config.settings.auth.canaille_port}"
        log = self.log_path.open("ab")
        self._process = subprocess.Popen(
            [str(_canaille_executable()), "run", "--bind", bind],
            env={**os.environ, "CANAILLE_CONFIG": str(self.config_path)},
            stdout=log,
            stderr=log,
            start_new_session=True,
        )
        atexit.register(self.stop)

    def wait_until_ready(self) -> None:
        url = f"{self.issuer_url}/.well-known/openid-configuration"
        deadline = time.monotonic() + READY_TIMEOUT_SECONDS
        while time.monotonic() < deadline:
            if self._process is not None and self._process.poll() is not None:
                raise RuntimeError(
                    f"Canaille exited with code {self._process.returncode}. "
                    f"See {self.log_path}"
                )
            try:
                if httpx.get(url, timeout=2, trust_env=False).status_code == 200:
                    return
            except httpx.HTTPError:
                pass
            time.sleep(0.25)
        raise RuntimeError(
            f"Canaille did not become ready at {url}. See {self.log_path}"
        )

    def stop(self) -> None:
        process, self._process = self._process, None
        if process is None or process.poll() is not None:
            return
        try:
            os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=STOP_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
        except ProcessLookupError:
            pass

    def export_settings(self) -> None:
        """Point the settings, and those of child processes, at this server."""
        client_id, client_secret = self.credentials()
        scopes = config.settings.auth.scopes.split()
        if "groups" not in scopes:
            scopes.append("groups")
        values = {
            "issuer_url": self.issuer_url,
            "client_id": client_id,
            "client_secret": client_secret,
            "scopes": " ".join(scopes),
        }
        for name, value in values.items():
            setattr(config.settings.auth, name, value)
            os.environ[f"AUTH_{name.upper()}"] = value


def _exit_on_sigterm(signum: int, frame: object) -> None:
    raise SystemExit(128 + signum)


@contextmanager
def managed_idp() -> Iterator[ManagedCanaille | None]:
    """Run the local identity provider for the duration of the block, when configured."""
    if config.settings.auth.provider != "canaille":
        yield None
        return
    in_main_thread = threading.current_thread() is threading.main_thread()
    previous_handler = (
        signal.signal(signal.SIGTERM, _exit_on_sigterm) if in_main_thread else None
    )
    idp = ManagedCanaille()
    try:
        idp.ensure_provisioned()
        idp.start()
        idp.wait_until_ready()
        idp.export_settings()
        yield idp
    finally:
        idp.stop()
        if in_main_thread:
            signal.signal(signal.SIGTERM, previous_handler or signal.SIG_DFL)
