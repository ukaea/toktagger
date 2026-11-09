import asyncio
import logging
from importlib.metadata import PackageNotFoundError, version

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, RedirectResponse

from toktagger.api.crud import utils
from toktagger.api.models import models_dependencies_installed

if models_dependencies_installed():
    from ray.exceptions import RayError

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="",
    tags=["Base"],
)

_ALL_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]


@router.api_route("/", methods=_ALL_METHODS, include_in_schema=False)
def get_app(request: Request):
    """Serve the main SPA."""
    if request.method in ("GET", "HEAD"):
        return FileResponse(request.app.state.index_file)
    return RedirectResponse(url="/", status_code=303)


@router.get("/health", operation_id="health_check", tags=["MCP"])
async def health_check(request: Request) -> dict:
    """
    Check the server is running correctly, identifying which optional features
    are currently available.

    Returns
    -------
    dict
        Status information describing backend health and available server
        features: name, version, db_connected, models_enabled, gpu_available,
        testing_mode.

    Notes
    -----
    Use When:
        - Verifying if the server is operational before proceeding with other operations
        - Checking the version of the backend server in use
        - Determining if ML model tools are enabled or disabled
        - Determining if GPUs are available for ML model training/prediction
        - Verifying database connectivity is working
    Do Not Use When:
        - Reading or modifying project, annotation, model, or dataset data
        - Retrieving detailed system metrics, logs, or diagnostics
    Example User Requests:
        - "Is the TokTagger server running?"
        - "Can this server run ML models?"
        - "Do I have GPU support available?"
        - "What version of TokTagger is deployed?"
    """
    try:
        vers = version("toktagger")
    except PackageNotFoundError:
        vers = "unknown"

    try:
        await utils.get_projects(
            db_client=request.app.state.db_client,
        )
        db_conn = True
    except Exception:  # noqa: BLE001 -- health check reports up/down, not why
        db_conn = False

    # If available, check whether GPUs enabled for model tasks
    model_gpu_available = False
    if models_dependencies_installed() and hasattr(request.app.state, "task_registry"):
        try:
            model_gpu_available = await asyncio.wait_for(
                request.app.state.task_registry.gpu_enabled.remote(), timeout=2
            )
        except (asyncio.TimeoutError, RayError):
            logger.warning("Task registry did not respond to the health check")

    # Return info
    return {
        "name": "TokTagger",
        "version": vers,
        "db_connected": db_conn,
        "models_enabled": models_dependencies_installed(),
        "gpu_available": model_gpu_available,
        "testing_mode": request.app.state.testing_mode,
    }


@router.api_route("/{full_path:path}", methods=_ALL_METHODS, include_in_schema=False)
def spa_fallback(request: Request, full_path: str):
    """Fallback for SPA routing — serves index.html on GET, redirects other methods.

    Without this, a native form POST to any SPA path (e.g. /ui/login) would return
    405 because Starlette sees the path match but the GET-only method doesn't match.
    """
    if request.method in ("GET", "HEAD"):
        return FileResponse(request.app.state.index_file)
    # A fixed target, not the requested path: "//host/" reflected into Location is a
    # protocol-relative URL the browser follows off-site.
    return RedirectResponse(url="/", status_code=303)
