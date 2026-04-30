import webbrowser
import argparse
from toktagger.api.main import Server
import uvicorn
import time
import threading
import os


# Need to point to app as a module level string if we want reload option
def create_app():
    server = Server()
    server._setup_app()
    return server.app


def do_open_browser(host: str, port: int):
    time.sleep(1)  # allow server to start
    webbrowser.open(f"http://{host}:{port}/ui/projects")


def main():
    print("""

  ▗▄▄▄▖▗▄▖ ▗▖ ▗▖▗▄▄▄▖▗▄▖  ▗▄▄▖ ▗▄▄▖▗▄▄▄▖▗▄▄▖ 
    █ ▐▌ ▐▌▐▌▗▞▘  █ ▐▌ ▐▌▐▌   ▐▌   ▐▌   ▐▌ ▐▌
    █ ▐▌ ▐▌▐▛▚▖   █ ▐▛▀▜▌▐▌▝▜▌▐▌▝▜▌▐▛▀▀▘▐▛▀▚▖
    █ ▝▚▄▞▘▐▌ ▐▌  █ ▐▌ ▐▌▝▚▄▞▘▝▚▄▞▘▐▙▄▄▖▐▌ ▐▌

    """)
    argparser = argparse.ArgumentParser(description="Run the FastAPI application")
    argparser.add_argument("--host", default="localhost", help="Host to run the app on")
    argparser.add_argument(
        "--port", default=8002, type=int, help="Port to run the app on"
    )
    argparser.add_argument(
        "--no-browser", action="store_true", help="Don't open a browser"
    )
    argparser.add_argument(
        "--reload", action="store_true", help="Reload the API on changes"
    )
    args = argparser.parse_args()
    open_browser = not args.no_browser
    if open_browser:
        threading.Thread(target=do_open_browser, args=(args.host, args.port)).start()

    os.environ["API_URL"] = f"http://{args.host}:{args.port}"

    uvicorn.run(
        "toktagger.api.cli:create_app",
        factory=True,
        host=args.host,
        port=args.port,
        reload=args.reload,
    )


if __name__ == "__main__":
    main()
