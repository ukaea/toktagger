import pytest


@pytest.mark.asyncio
@pytest.mark.models_enabled
async def test_health_models_enabled(api_client, setup_db):
    response = await api_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "TokTagger"
    assert data.get("version")  # Won't check its contents here
    assert data.get("db_connected")
    assert data.get("models_enabled")


@pytest.mark.asyncio
@pytest.mark.models_disabled
async def test_health_models_disabled(api_client, setup_db):
    response = await api_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "TokTagger"
    assert data.get("version")  # Won't check its contents here
    assert data.get("db_connected")
    assert not data.get("models_enabled")
