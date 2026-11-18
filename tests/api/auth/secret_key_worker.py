"""Helper invoked as a separate OS process by test_secret_key.py.

Kept out of the test module so each worker starts from a clean interpreter: the
serializer built from the signing key is cached in module state, so threads in one
interpreter would share it and never exercise the cross-process race.

The worker waits at a file barrier before deriving the key. Without it, interpreter
start-up (seconds) dwarfs the derivation (milliseconds) and the workers never overlap
-- which lets an unsynchronised implementation pass.

Usage: python secret_key_worker.py <cache_dir> <prefix> [--barrier]
"""

import sys
import time
from pathlib import Path

from toktagger.api import config
from toktagger.api.auth.core import _read_or_create_secret

BARRIER_TIMEOUT_S = 120


def _wait_for_start(cache_dir: str, prefix: str) -> None:
    """Announce readiness, then block until the parent releases every worker at once."""
    Path(f"{cache_dir}.ready-{prefix}").write_text("1")
    start = Path(f"{cache_dir}.start")
    deadline = time.monotonic() + BARRIER_TIMEOUT_S
    while not start.exists():
        if time.monotonic() > deadline:
            raise TimeoutError("barrier was never released")
        time.sleep(0.01)


def _derive(cache_dir: str, prefix: str, barrier: bool) -> None:
    config.settings.auth.secret_key = None
    directory = Path(cache_dir)
    directory.mkdir(parents=True, exist_ok=True)

    if barrier:
        _wait_for_start(cache_dir, prefix)

    print(_read_or_create_secret(directory))


if __name__ == "__main__":
    _derive(sys.argv[1], sys.argv[2], barrier="--barrier" in sys.argv[3:])
