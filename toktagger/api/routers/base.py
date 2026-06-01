from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, RedirectResponse

router = APIRouter(
    prefix="",
    tags=["Base"],
)

_ALL_METHODS = ["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]


@router.api_route("/", methods=_ALL_METHODS)
def get_app(request: Request):
    """Serve the main SPA."""
    if request.method in ("GET", "HEAD"):
        return FileResponse(request.app.state.index_file)
    return RedirectResponse(url="/", status_code=303)


@router.api_route("/{full_path:path}", methods=_ALL_METHODS)
def spa_fallback(request: Request, full_path: str):
    """Fallback for SPA routing — serves index.html on GET, redirects other methods.

    Without this, a native form POST to any SPA path (e.g. /ui/login) would return
    405 because Starlette sees the path match but the GET-only method doesn't match.
    """
    if request.method in ("GET", "HEAD"):
        return FileResponse(request.app.state.index_file)
    return RedirectResponse(url=f"/{full_path}", status_code=303)
