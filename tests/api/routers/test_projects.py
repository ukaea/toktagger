import pytest
import asyncio
@pytest.mark.asyncio
async def test_get_all_projects(api_client, db_projects):
    response = await api_client.get("/projects")
    assert response.status_code == 200
    returned_projects = response.json()
    assert [project['name'] for project in returned_projects] == ["test_project_1", "test_project_2"]
    assert [project['_id'] for project in returned_projects] == db_projects
    
@pytest.mark.asyncio
async def test_get_projects(api_client, db_projects):
    response = await api_client.get("/projects")
    assert response.status_code == 200
    returned_projects = response.json()
    assert [project['name'] for project in returned_projects] == ["test_project_1", "test_project_2"]
    assert [project['_id'] for project in returned_projects] == db_projects
    
# @pytest.mark.asyncio
# async def test_get_projects_start(api_client, db_projects):
#     response = await api_client.get("/projects?start=1")
#     assert response.status_code == 200
#     returned_projects = response.json()
#     assert "test_project_2" in [project['name'] for project in returned_projects]
#     assert "test_project_1" not in [project['name'] for project in returned_projects]
    
# @pytest.mark.asyncio
# async def test_get_projects_end(api_client, db_projects):
#     response = await api_client.get("/projects?end=1")
#     assert response.status_code == 200
#     returned_projects = response.json()
#     assert "test_project_1" in [project['name'] for project in returned_projects]
#     assert "test_project_2" not in [project['name'] for project in returned_projects]