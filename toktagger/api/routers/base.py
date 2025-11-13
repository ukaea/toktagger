from fastapi import APIRouter, Request
from fastapi.responses import FileResponse

router = APIRouter(
    prefix="",
    tags=["Base"],
)


@router.get("/")
def get_app(request: Request):
    """Endpoint to serve the main SPA."""
    return FileResponse(request.app.state.index_file)


@router.get("/{full_path:path}")
def spa_fallback(request: Request, full_path: str):
    """Fallback route to serve the SPA's index.html for any unmatched routes.
    This ensures that refreshing pages on the frontend takes the user to the same place.
    """
    return FileResponse(request.app.state.index_file)
