from toktagger.api.auth.canaille import managed_idp
from toktagger.api.config import settings
from toktagger.api.main import run_server, warn_if_insecure

if __name__ == "__main__":
    with managed_idp():
        warn_if_insecure()
        run_server(
            settings.server.host,
            settings.server.port,
            settings.server.workers,
            settings.server.reload,
        )
