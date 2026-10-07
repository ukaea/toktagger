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


def test_gunicorn_receives_proxy_and_timeout_settings(monkeypatch):
    monkeypatch.setattr(config.settings.server, "forwarded_allow_ips", "10.0.0.5")
    monkeypatch.setattr(config.settings.server, "gunicorn_timeout", 90)
    monkeypatch.setattr(main, "models_dependencies_installed", lambda: False)
    process = MagicMock()
    process.wait.return_value = 0
    popen = MagicMock(return_value=process)
    monkeypatch.setattr(main.subprocess, "Popen", popen)

    main.run_with_gunicorn("0.0.0.0", 8002, 2)

    args = popen.call_args.args[0]
    assert args[args.index("--forwarded-allow-ips") + 1] == "10.0.0.5"
    assert args[args.index("--timeout") + 1] == "90"
    assert args[args.index("--graceful-timeout") + 1] == "90"
    assert "--access-logfile" in args
