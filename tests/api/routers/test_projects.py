import pytest
import asyncio

@pytest.mark.asyncio
async def test_get_all_projects(api_client, db_projects):
    response = await api_client.get("/projects")
    assert response.status_code == 200
    returned_projects = response.json()
    assert [project['name'] for project in returned_projects] == ["test_project_0", "test_project_1", "test_project_2"]
    assert [project['_id'] for project in returned_projects] == db_projects
    
@pytest.mark.asyncio
async def test_get_projects_start(api_client, db_projects):
    response = await api_client.get("/projects?start=1")
    # Should return 2 projects
    assert response.status_code == 200
    returned_projects = response.json()
    assert len(returned_projects) == 2
    assert [project['name'] for project in returned_projects] == ["test_project_1", "test_project_2"]
    
@pytest.mark.asyncio
async def test_get_projects_end(api_client, db_projects):
    response = await api_client.get("/projects?end=1")
    # Should return 2 projects
    assert response.status_code == 200
    returned_projects = response.json()
    assert len(returned_projects) == 2
    assert [project['name'] for project in returned_projects] == ["test_project_0", "test_project_1"]
    
@pytest.mark.asyncio
async def test_get_projects_start_end(api_client, db_projects):
    response = await api_client.get("/projects?start=1&end=1")
    # Should return 2 projects
    assert response.status_code == 200
    returned_projects = response.json()
    assert len(returned_projects) == 1
    assert [project['name'] for project in returned_projects] == ["test_project_1"]
    
@pytest.mark.asyncio
async def test_get_projects_invalid_start(api_client, db_projects):
    response = await api_client.get("/projects?start=10")
    # Should return 2 projects
    assert response.status_code == 200
    returned_projects = response.json()
    assert len(returned_projects) == 0
    
@pytest.mark.asyncio
async def test_get_projects_invalid_start_lessthan_end(api_client, db_projects):
    response = await api_client.get("/projects?start=2&end=1")
    # Should raise a bad request exception
    assert response.status_code == 400
    assert 'Invalid parameters - end must be higher than start' in response.json().get("detail")
    
    
@pytest.mark.asyncio
async def test_create_project(api_client, db_client):
    in_project = {
        "name": "test_project",
        "task": "UFO",
        "query_strategy": "random",
        "data_loader": "image"
    }
    response = await api_client.post("/projects", json=in_project)
    assert (_id := response.json().get("_id"))
    
    # Check it has been added to database
    projects = await db_client.get_all_documents("projects")
    assert len(projects) == 1
    
    for key, value in in_project.items():
        assert projects[0][key] == value
        
    assert str(projects[0]["_id"]) == _id
    assert projects[0].get("timestamp")
    