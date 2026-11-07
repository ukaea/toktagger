"""ASGI entry point for a standalone uvicorn deployment.

Usage:
    uvicorn toktagger.api.asgi:app --workers 4 --host 0.0.0.0 --port 8002
"""

from toktagger.api.cli import create_app

app = create_app()
