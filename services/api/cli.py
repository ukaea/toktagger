import argparse
from services.api.main import Server
import webbrowser
import uvicorn

# Need to point to app as a module level string if we want reload option
server = Server()
server._setup_app()
app = server.app


def main():
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
        webbrowser.open(f"http://{args.host}:{args.port}")
    uvicorn.run(
        "services.api.cli:app", host=args.host, port=args.port, reload=args.reload
    )
