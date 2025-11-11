import threading
import time
import webbrowser
import argparse
import uvicorn
from services.api.main import app


def do_open_browser(host: str, port: int):
    time.sleep(1)  # allow server to start
    webbrowser.open(f"http://{host}:{port}/ui/projects")


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

    if open_browser:
        threading.Thread(target=do_open_browser, args=(args.host, args.port)).start()

    uvicorn.run(app, host=args.host, port=args.port)
