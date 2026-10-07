import json
import os
import signal
import socket
import stat

import httpx
import pytest

pytest.importorskip("canaille")

from toktagger.api import config  # noqa: E402
from toktagger.api.auth import canaille  # noqa: E402
from toktagger.api.auth.canaille import ManagedCanaille, managed_idp  # noqa: E402


def _free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


@pytest.fixture
def canaille_settings(monkeypatch, tmp_path):
    server = config.Server(cache_dir=tmp_path, host="127.0.0.1", port=_free_port())
    auth = config.Auth(
        provider="canaille",
        canaille_port=_free_port(),
        canaille_bootstrap_password="Bootstrap-pw-1",
    )
    monkeypatch.setattr(config.settings, "server", server)
    monkeypatch.setattr(config.settings, "auth", auth)
    for name in ("ISSUER_URL", "CLIENT_ID", "CLIENT_SECRET", "SCOPES"):
        monkeypatch.delenv(f"AUTH_{name}", raising=False)
    return auth


def _clients(idp: ManagedCanaille) -> list[dict]:
    return json.loads(idp._cli("get", "client").splitlines()[-1])


def _users(idp: ManagedCanaille) -> list[dict]:
    return json.loads(idp._cli("get", "user").splitlines()[-1])


def test_first_provisioning_creates_admin_group_and_client(canaille_settings, capsys):
    idp = ManagedCanaille()

    idp.ensure_provisioned()

    assert idp.marker_path.exists()
    assert [user["user_name"] for user in _users(idp)] == ["admin"]
    groups = json.loads(idp._cli("get", "group").splitlines()[-1])
    assert [group["display_name"] for group in groups] == ["toktagger-admins"]
    assert len(groups[0]["members"]) == 1
    client = _clients(idp)[0]
    public_url = config.settings.public_url
    assert client["client_id"] == "toktagger"
    assert client["redirect_uris"] == [f"{public_url}/auth/callback"]
    assert client["post_logout_redirect_uris"] == [f"{public_url}/ui/login"]
    assert client["grant_types"] == ["authorization_code", "refresh_token"]
    assert client["audience"]
    banner = capsys.readouterr().out
    assert "Bootstrap-pw-1" in banner
    assert "Username: admin" in banner


def test_random_bootstrap_password_is_printed_when_none_is_configured(
    canaille_settings, capsys
):
    canaille_settings.canaille_bootstrap_password = None

    ManagedCanaille().ensure_provisioned()

    banner = capsys.readouterr().out
    password = banner.split("Password: ")[1].split()[0]
    assert len(password) >= 12
    assert password != "Bootstrap-pw-1"


def test_provisioning_twice_changes_nothing_and_prints_nothing(
    canaille_settings, capsys
):
    idp = ManagedCanaille()
    idp.ensure_provisioned()
    capsys.readouterr()
    before = (idp.client_path.read_text(), idp.keys_path.read_text(), _users(idp))

    ManagedCanaille().ensure_provisioned()

    assert (
        idp.client_path.read_text(),
        idp.keys_path.read_text(),
        _users(idp),
    ) == before
    assert len(_clients(idp)) == 1
    assert capsys.readouterr().out == ""


def test_secret_files_are_private(canaille_settings):
    idp = ManagedCanaille()

    idp.ensure_provisioned()

    for path in (idp.client_path, idp.keys_path, idp.config_path):
        assert stat.S_IMODE(os.stat(path).st_mode) == 0o600, path


def test_client_credentials_are_generated_and_stored(canaille_settings):
    idp = ManagedCanaille()
    idp.ensure_provisioned()

    client_id, client_secret = idp.credentials()

    assert client_id == "toktagger"
    assert len(client_secret) >= 32
    assert _clients(idp)[0]["client_secret"] == client_secret


def test_redirect_uris_follow_a_changed_public_url(canaille_settings):
    idp = ManagedCanaille()
    idp.ensure_provisioned()

    canaille_settings.public_url = "https://toktagger.example.com"
    ManagedCanaille().ensure_provisioned()

    client = _clients(idp)[0]
    assert client["redirect_uris"] == ["https://toktagger.example.com/auth/callback"]
    assert client["post_logout_redirect_uris"] == [
        "https://toktagger.example.com/ui/login"
    ]
    assert json.loads(idp.client_path.read_text())["public_url"] == (
        "https://toktagger.example.com"
    )


def test_a_failed_first_provisioning_is_retried_cleanly(canaille_settings, monkeypatch):
    idp = ManagedCanaille()
    original = ManagedCanaille._provision

    def fail_after_partial_work(self):
        self._cli("install")
        raise RuntimeError("boom")

    monkeypatch.setattr(ManagedCanaille, "_provision", fail_after_partial_work)
    with pytest.raises(RuntimeError, match="boom"):
        idp.ensure_provisioned()
    assert not idp.marker_path.exists()

    monkeypatch.setattr(ManagedCanaille, "_provision", original)
    idp.ensure_provisioned()

    assert idp.marker_path.exists()
    assert [user["user_name"] for user in _users(idp)] == ["admin"]


def test_cli_failure_reports_stderr(canaille_settings):
    idp = ManagedCanaille()
    idp.ensure_provisioned()

    with pytest.raises(RuntimeError, match="canaille create"):
        idp._cli("create", "user", "--not-an-option")


def test_users_can_be_created_in_the_admin_group(canaille_settings):
    idp = ManagedCanaille()
    idp.ensure_provisioned()

    idp.create_user("alice", "Alice-pw-12345")
    idp.create_user("boss", "Boss-pw-12345", groups=("toktagger-admins",))

    groups = json.loads(idp._cli("get", "group").splitlines()[-1])
    assert len(groups[0]["members"]) == 2
    assert {user["user_name"] for user in _users(idp)} == {"admin", "alice", "boss"}


def test_the_rendered_config_uses_the_issuer_and_trusts_the_toktagger_host(
    canaille_settings,
):
    idp = ManagedCanaille()
    idp.ensure_provisioned()

    rendered = idp.config_path.read_text()

    assert f'SERVER_NAME = "127.0.0.1:{canaille_settings.canaille_port}"' in rendered
    assert 'TRUSTED_DOMAINS = ["127.0.0.1"]' in rendered
    assert 'groups = "toktagger-admins"' in rendered


def test_start_serves_discovery_and_stop_releases_the_port(canaille_settings):
    idp = ManagedCanaille()
    idp.ensure_provisioned()
    idp.start()
    try:
        idp.wait_until_ready()
        metadata = httpx.get(
            f"{idp.issuer_url}/.well-known/openid-configuration"
        ).json()
        assert metadata["issuer"] == idp.issuer_url
        assert "end_session_endpoint" in metadata
    finally:
        idp.stop()

    assert not idp._port_in_use()


def test_start_refuses_a_port_that_is_already_in_use(canaille_settings):
    idp = ManagedCanaille()
    idp.ensure_provisioned()
    with socket.socket() as blocker:
        blocker.bind(("127.0.0.1", canaille_settings.canaille_port))
        blocker.listen()

        with pytest.raises(RuntimeError, match="already in use"):
            idp.start()


def test_wait_until_ready_reports_a_process_that_exited(canaille_settings, monkeypatch):
    idp = ManagedCanaille()
    idp.ensure_provisioned()
    idp.config_path.write_text("this is not valid toml = = =")
    idp.start()

    with pytest.raises(RuntimeError, match="exited"):
        idp.wait_until_ready()


def test_stop_is_safe_to_call_twice_and_before_start(canaille_settings):
    idp = ManagedCanaille()
    idp.stop()
    idp.ensure_provisioned()
    idp.start()
    idp.stop()
    idp.stop()


def test_export_settings_hands_the_provider_to_this_and_child_processes(
    canaille_settings, monkeypatch
):
    idp = ManagedCanaille()
    idp.ensure_provisioned()
    monkeypatch.setattr(os, "environ", dict(os.environ))

    idp.export_settings()

    client_id, client_secret = idp.credentials()
    assert canaille_settings.issuer_url == idp.issuer_url
    assert canaille_settings.client_secret == client_secret
    assert "groups" in canaille_settings.scopes.split()
    assert os.environ["AUTH_ISSUER_URL"] == idp.issuer_url
    assert os.environ["AUTH_CLIENT_ID"] == client_id
    assert os.environ["AUTH_CLIENT_SECRET"] == client_secret
    assert "groups" in os.environ["AUTH_SCOPES"].split()


def test_export_settings_keeps_existing_scopes_without_duplicating_groups(
    canaille_settings, monkeypatch
):
    canaille_settings.scopes = "openid profile email groups"
    idp = ManagedCanaille()
    idp.ensure_provisioned()
    monkeypatch.setattr(os, "environ", dict(os.environ))

    idp.export_settings()

    assert canaille_settings.scopes.split().count("groups") == 1


def test_managed_idp_does_nothing_for_an_external_provider(monkeypatch, tmp_path):
    auth = config.Auth(
        provider="oidc", issuer_url="https://idp.example.com", client_secret="s"
    )
    monkeypatch.setattr(config.settings, "auth", auth)
    monkeypatch.setattr(config.settings, "server", config.Server(cache_dir=tmp_path))

    with managed_idp() as idp:
        assert idp is None

    assert not (tmp_path / "canaille").exists()


def test_managed_idp_runs_the_server_for_the_block_and_stops_it(
    canaille_settings, monkeypatch
):
    monkeypatch.setattr(os, "environ", dict(os.environ))
    port = canaille_settings.canaille_port

    with managed_idp() as idp:
        assert idp is not None
        assert canaille_settings.issuer_url == idp.issuer_url
        response = httpx.get(f"{idp.issuer_url}/.well-known/openid-configuration")
        assert response.status_code == 200

    with socket.socket() as probe:
        assert probe.connect_ex(("127.0.0.1", port)) != 0


def test_launcher_modules_start_the_managed_provider():
    import toktagger.api.cli as cli
    import toktagger.api.run as run

    assert cli.managed_idp is canaille.managed_idp
    assert run.managed_idp is canaille.managed_idp


def test_sigterm_stops_the_provider_instead_of_leaving_it_running(
    canaille_settings, monkeypatch
):
    monkeypatch.setattr(os, "environ", dict(os.environ))
    port = canaille_settings.canaille_port
    handler_before = signal.getsignal(signal.SIGTERM)

    with pytest.raises(SystemExit):
        with managed_idp():
            signal.getsignal(signal.SIGTERM)(signal.SIGTERM, None)

    assert signal.getsignal(signal.SIGTERM) == handler_before
    with socket.socket() as probe:
        assert probe.connect_ex(("127.0.0.1", port)) != 0
