"""
Sweeps every registered API route and confirms an unauthenticated caller (no
Authorization header at all) can't get anything out of it.

`get_current_user` is wired in as a router-level dependency on every business
router, so it should reject with 401 before any path/query/body validation or
database work happens for that route — this asserts that holds everywhere,
not just the handful of endpoints covered individually elsewhere.
"""

import re

import pytest

from toktagger.api.main import Server

# Explicitly public: login, health/docs, and the SPA/static catch-alls served by
# the base router (no application data, and must be reachable pre-login).
_PUBLIC_PATHS = {
    "/",
    "/{full_path:path}",
    "/health",
    "/docs",
    "/docs/oauth2-redirect",
    "/redoc",
    "/openapi.json",
}
_PUBLIC_METHOD_PATHS = {
    ("GET", "/auth/config"),
    ("GET", "/auth/login"),
    ("GET", "/auth/callback"),
}


def _iter_leaf_routes(routes):
    """Recursively walk a Starlette route list, descending into included routers.

    Starlette wraps each `include_router()` call in an opaque `_IncludedRouter`
    instead of flattening its routes into `app.routes`, so a plain iteration
    over `app.routes` never reaches the actual endpoints.
    """
    for route in routes:
        original_router = getattr(route, "original_router", None)
        if original_router is not None:
            yield from _iter_leaf_routes(original_router.routes)
        elif (
            getattr(route, "methods", None) and getattr(route, "path", None) is not None
        ):
            yield route


def _protected_routes() -> list[tuple[str, str]]:
    """Introspect the FastAPI app for every (method, path) expected to require auth."""
    server = Server()
    server._setup_app()

    routes = []
    for route in _iter_leaf_routes(server.app.routes):
        if route.path in _PUBLIC_PATHS:
            continue
        for method in sorted(route.methods):
            if method in ("HEAD", "OPTIONS"):
                continue
            if (method, route.path) in _PUBLIC_METHOD_PATHS:
                continue
            routes.append((method, route.path))
    return routes


def _fill_path(path: str) -> str:
    """Replace every {param} with a placeholder — auth is checked before path params are used."""
    return re.sub(r"\{[^}]+\}", "x", path)


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path", _protected_routes())
async def test_unauthenticated_request_is_rejected(
    unauthenticated_api_client, method, path
):
    # Model routes also depend on check_models_enabled (503 when the optional
    # `models` extra isn't installed), but every endpoint declares its auth
    # dependency before that one, so an unauthenticated caller always gets
    # 401 first regardless of whether models are installed.
    resp = await unauthenticated_api_client.request(method, _fill_path(path))

    assert resp.status_code == 401, f"{method} {path} -> {resp.status_code}"
