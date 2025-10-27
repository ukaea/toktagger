import argparse
from services.api.main import Server


def main():
    argparser = argparse.ArgumentParser(description="Run the FastAPI application")
    argparser.add_argument("--host", default="localhost", help="Host to run the app on")
    argparser.add_argument(
        "--port", default=8002, type=int, help="Port to run the app on"
    )
    argparser.add_argument(
        "--no-browser", action="store_true", help="Don't open a browser"
    )
    args = argparser.parse_args()
    open_browser = not args.no_browser

    server = Server()
    server.run(args.host, args.port, open_browser)
