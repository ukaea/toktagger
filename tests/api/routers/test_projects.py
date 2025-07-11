import pytest
import asyncio
@pytest.mark.asyncio
async def test_get_all_projects(api_client, db_projects):
    print("TEST LOOP:", asyncio.get_event_loop())
    id1, id2 =  db_projects
    response = await api_client.get("/projects")
    assert response.status_code == 200
    returned_projects = response.json()
    assert [project['name'] for project in returned_projects] == ["test_project_1", "test_project_2"]
    assert [project['_id'] for project in returned_projects] == db_projects
