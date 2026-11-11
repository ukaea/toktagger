import argparse
import threading
import time
import webbrowser

from toktagger.api.auth.canaille import managed_idp
from toktagger.api.config import settings
from toktagger.api.main import Server, run_server, warn_if_insecure
from toktagger.api.models import models_dependencies_installed


# Need to point to app as a module level string if we want reload option
def create_app():
    server = Server()
    server._setup_app()
    # Setup ray if required
    if models_dependencies_installed():
        server._setup_ray()
    return server.app


def apply_cli_overrides(settings, args) -> None:
    """Let explicit command-line flags win over the loaded configuration.

    Only flags the user actually passed: an argparse default would otherwise
    overwrite whatever the TOML file or the environment supplied.
    """
    if args.host is not None:
        settings.server.host = args.host
    if args.port is not None:
        settings.server.port = args.port
    if args.workers is not None:
        settings.server.workers = args.workers
    if args.reload:
        settings.server.reload = True


def do_open_browser(host: str, port: int):
    time.sleep(1)  # allow server to start
    display_host = "localhost" if host == "0.0.0.0" else host
    webbrowser.open(f"http://{display_host}:{port}/ui/projects")


def main():
    print("""

  ▗▄▄▄▖▗▄▖ ▗▖ ▗▖▗▄▄▄▖▗▄▖  ▗▄▄▖ ▗▄▄▖▗▄▄▄▖▗▄▄▖ 
    █ ▐▌ ▐▌▐▌▗▞▘  █ ▐▌ ▐▌▐▌   ▐▌   ▐▌   ▐▌ ▐▌
    █ ▐▌ ▐▌▐▛▚▖   █ ▐▛▀▜▌▐▌▝▜▌▐▌▝▜▌▐▛▀▀▘▐▛▀▚▖
    █ ▝▚▄▞▘▐▌ ▐▌  █ ▐▌ ▐▌▝▚▄▞▘▝▚▄▞▘▐▙▄▄▖▐▌ ▐▌

    """)
    argparser = argparse.ArgumentParser(description="Run the FastAPI application")
    argparser.add_argument("--host", help="Host to run the app on")
    argparser.add_argument("--port", type=int, help="Port to run the app on")
    argparser.add_argument(
        "--no-browser", action="store_true", help="Don't open a browser"
    )
    argparser.add_argument(
        "--reload",
        action="store_true",
        help="Reload the API on changes (single-worker uvicorn only)",
    )
    argparser.add_argument(
        "--workers",
        type=int,
        help="Number of uvicorn worker processes (use 1 for single-worker dev mode)",
    )
    args = argparser.parse_args()
    apply_cli_overrides(settings, args)

    with managed_idp():
        warn_if_insecure()
        if not args.no_browser:
            threading.Thread(
                target=do_open_browser,
                args=(settings.server.host, settings.server.port),
            ).start()

        run_server(
            settings.server.host,
            settings.server.port,
            settings.server.workers,
            settings.server.reload,
        )


if __name__ == "__main__":
    main()
