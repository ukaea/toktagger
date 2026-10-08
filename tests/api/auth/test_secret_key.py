"""Derivation of the session-signing key.

Every worker caches its serializer for life, so a key generated per-process rather
than shared means cookies issued by one worker are rejected by the others. These
tests drive the first-run derivation with real subprocesses, since the cached
serializer is per-process state that threads would share.
"""

import stat
import subprocess
import sys
import time
from pathlib import Path

import pytest

import toktagger.api.auth.core as auth_core
from toktagger.api import config
from toktagger.api.auth.core import _read_or_create_secret, decode_token

WORKER = Path(__file__).parent / "secret_key_worker.py"
REPO_ROOT = Path(__file__).resolve().parents[3]
BARRIER_TIMEOUT_S = 120


@pytest.fixture(autouse=True)
def _no_configured_secret(monkeypatch):
    """Exercise the generate-and-persist path without leaking into other tests.

    config.settings is a module-level singleton shared by the whole session, so
    assigning to it directly would outlive these tests.
    """
    monkeypatch.setattr(config.settings.auth, "secret_key", None)


def _spawn(cache_dir: Path, prefix: str, barrier: bool = False) -> subprocess.Popen:
    args = [sys.executable, str(WORKER), str(cache_dir), prefix]
    if barrier:
        args.append("--barrier")
    return subprocess.Popen(
        args, cwd=REPO_ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )


def _release_barrier(cache_dir: Path, prefixes: list[str]) -> None:
    """Wait until every worker is up, then start them all together."""
    deadline = time.monotonic() + BARRIER_TIMEOUT_S
    while time.monotonic() < deadline:
        if all(Path(f"{cache_dir}.ready-{p}").exists() for p in prefixes):
            break
        time.sleep(0.05)
    else:
        raise AssertionError("workers never reached the barrier")
    Path(f"{cache_dir}.start").write_text("go")


def test_concurrent_workers_agree_on_one_key(tmp_path):
    """Workers starting together on an empty cache dir all derive the same key.

    Without a lock each worker sees the file missing, generates its own key and keeps
    it, so a session opened against one worker 401s on every other until restart.
    """
    cache_dir = tmp_path / "cache"
    prefixes = ["w1", "w2", "w3", "w4"]

    procs = [_spawn(cache_dir, prefix, barrier=True) for prefix in prefixes]
    try:
        _release_barrier(cache_dir, prefixes)
    except AssertionError:
        for proc in procs:
            proc.kill()
        raise

    keys = []
    for proc in procs:
        stdout, stderr = proc.communicate(timeout=180)
        assert proc.returncode == 0, stderr.decode()
        keys.append(stdout.decode().strip())

    assert len(set(keys)) == 1, f"workers derived {len(set(keys))} different keys"
    assert keys[0] == (cache_dir / "secret.key").read_text().strip()


def test_generated_key_is_not_world_readable(tmp_path):
    """The key signs every session cookie, so other local accounts must not read it."""
    secret = _read_or_create_secret(tmp_path)
    assert secret

    mode = stat.S_IMODE((tmp_path / "secret.key").stat().st_mode)
    assert mode == 0o600, f"secret.key is {oct(mode)}"


def test_key_is_reused_on_a_second_call(tmp_path):
    """A restart must not invalidate sessions signed before it."""
    first = _read_or_create_secret(tmp_path)
    assert _read_or_create_secret(tmp_path) == first


def test_configured_secret_key_takes_precedence(tmp_path, monkeypatch):
    """An explicit AUTH_SECRET_KEY is used without touching the cache dir."""
    monkeypatch.setattr(config.settings.server, "cache_dir", tmp_path)
    monkeypatch.setattr(config.settings.auth, "secret_key", "configured-secret")
    monkeypatch.setattr(auth_core, "_serializer", None)

    token = auth_core.create_access_token({"sub": "alice"})
    assert decode_token(token)["sub"] == "alice"
    assert not (tmp_path / "secret.key").exists()


@pytest.mark.parametrize("workers", [2, 3])
def test_late_worker_reads_the_existing_key(tmp_path, workers):
    """A worker starting after the key exists reads it rather than replacing it."""
    cache_dir = tmp_path / "cache"
    cache_dir.mkdir()
    existing = _read_or_create_secret(cache_dir)

    for i in range(workers):
        proc = _spawn(cache_dir, f"late{i}")
        stdout, stderr = proc.communicate(timeout=180)
        assert proc.returncode == 0, stderr.decode()
        assert stdout.decode().strip() == existing
