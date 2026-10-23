import warnings

import pytest

from toktagger.api.main import Server


def test_openapi_schema_has_no_duplicate_operation_ids():
    """The SPA catch-all routes must be excluded from the OpenAPI schema.

    They are registered as single multi-method routes, so FastAPI would otherwise
    reuse one operation ID across every method and warn about duplicates when the
    schema is generated.
    """
    server = Server()
    server._setup_app()

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        schema = server.app.openapi()

    duplicate_warnings = [
        str(w.message) for w in caught if "Duplicate Operation ID" in str(w.message)
    ]
    assert duplicate_warnings == []

    # Catch-all SPA routes are excluded from the schema; real operations remain.
    paths = schema["paths"]
    assert "/" not in paths
    assert "/{full_path}" not in paths
    assert "/health" in paths


@pytest.mark.asyncio
@pytest.mark.models_enabled
async def test_health_models_enabled(models_api_client, setup_db):
    response = await models_api_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "TokTagger"
    assert data.get("version")  # Won't check its contents here
    assert data.get("db_connected")
    assert data.get("models_enabled")
    assert data.get("gpu_available")  # Forced to be 1 GPUs in conftest setup


@pytest.mark.asyncio
@pytest.mark.models_disabled
async def test_health_models_disabled(api_client, setup_db):
    response = await api_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "TokTagger"
    assert data.get("version")  # Won't check its contents here
    assert data.get("db_connected")
    assert data.get("models_enabled") is False
    assert data.get("gpu_available") is False


async def _send_raw_path(app, method: str, path: str) -> dict:
    """Drive the ASGI app with `path` exactly as given, returning the response start.

    Sent as a scope rather than through httpx, which resolves "//host/" to an
    authority before the request is built and so cannot express the case under test.
    """
    messages = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        messages.append(message)

    await app(
        {
            "type": "http",
            "asgi": {"version": "3.0", "spec_version": "2.1"},
            "http_version": "1.1",
            "method": method,
            "scheme": "http",
            "path": path,
            "raw_path": path.encode(),
            "query_string": b"",
            "root_path": "",
            "headers": [(b"host", b"localhost")],
            "client": ("127.0.0.1", 12345),
            "server": ("localhost", 8002),
        },
        receive,
        send,
    )
    return next(m for m in messages if m["type"] == "http.response.start")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path",
    [
        "/ui/login",
        "//evil.example.com/",
        "///evil.example.com/",
        "/%2F%2Fevil.example.com/",
    ],
)
async def test_spa_fallback_redirects_to_a_fixed_target(path):
    """The fallback must never reflect the requested path into Location.

    "//host/" is a protocol-relative URL, so reflecting it sends the browser
    off-site. Reflecting the path also turned a genuine 405 into a method
    downgrade, e.g. DELETE /users redirecting to GET /users.
    """
    server = Server()
    server._setup_app()

    start = await _send_raw_path(server.app, "POST", path)
    headers = {k.decode().lower(): v.decode() for k, v in start["headers"]}

    assert start["status"] == 303
    assert headers["location"] == "/", f"{path} leaked into Location"
