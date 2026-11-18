import logging
from unittest.mock import MagicMock

import pytest

from toktagger.api import config, main


@pytest.mark.parametrize(
    ("public_url", "warns"),
    [
        ("http://localhost:8002", False),
        ("http://127.0.0.1:8002", False),
        ("https://toktagger.example.com", False),
        ("http://toktagger.example.com", True),
    ],
)
def test_warn_if_insecure(monkeypatch, caplog, public_url, warns):
    monkeypatch.setattr(config.settings.auth, "public_url", public_url)

    with caplog.at_level(logging.WARNING, logger=main.logger.name):
        main.warn_if_insecure()

    assert bool(caplog.records) is warns


def test_run_server_passes_workers_and_proxy_settings(monkeypatch):
    monkeypatch.setattr(config.settings.server, "forwarded_allow_ips", "10.0.0.5")
    monkeypatch.setattr(config.settings.server, "shutdown_timeout", 90)
    monkeypatch.setattr(config.settings.server, "healthcheck_timeout", 45)
    monkeypatch.setattr(main, "models_dependencies_installed", lambda: False)
    uvicorn_run = MagicMock()
    monkeypatch.setattr(main.uvicorn, "run", uvicorn_run)

    main.run_server("0.0.0.0", 8002, 2, reload=False)

    kwargs = uvicorn_run.call_args.kwargs
    assert kwargs["workers"] == 2
    assert kwargs["forwarded_allow_ips"] == "10.0.0.5"
    assert kwargs["timeout_graceful_shutdown"] == 90
    assert kwargs["timeout_worker_healthcheck"] == 45


def test_run_server_ignores_reload_with_several_workers(monkeypatch):
    monkeypatch.setattr(main, "models_dependencies_installed", lambda: False)
    uvicorn_run = MagicMock()
    monkeypatch.setattr(main.uvicorn, "run", uvicorn_run)

    main.run_server("localhost", 8002, 2, reload=True)

    assert uvicorn_run.call_args.kwargs["reload"] is False
