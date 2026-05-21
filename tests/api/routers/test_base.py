import pytest


@pytest.mark.asyncio
async def test_health(api_client, setup_db):
    response = await api_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "TokTagger"
    assert data.get("version")  # Won't check its contents here
    assert data.get("db_connected")
    assert data.get("models_enabled")
