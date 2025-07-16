import pytest
import asyncio
from bson.objectid import ObjectId

@pytest.mark.asyncio
async def test_get_all_projects(api_client, db_projects):
    response = await api_client.get("/projects")
    assert response.status_code == 200
    returned_projects = response.json()
    assert [project['name'] for project in returned_projects] == ["test_project_0", "test_project_1", "test_project_2"]
    assert [project['_id'] for project in returned_projects] == db_projects
    
@pytest.mark.asyncio
async def test_get_projects_start(api_client, setup_db):
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
async def test_get_project_id(api_client, db_projects):
    project_id = db_projects[0]
    response = await api_client.get(f"/projects/{project_id}")
    assert response.status_code == 200
    returned_project = response.json()
    # Check info matches what we created the entry with
    assert returned_project.get("name") == "test_project_0"
    assert returned_project.get("task") == 'ELM'
    assert returned_project.get("query_strategy") == "random"
    assert returned_project.get("data_loader") == "uda"
    
    # Then also check ID and timestamp are returned - should have been added automatically
    assert returned_project.get("_id") == project_id
    assert returned_project.get("timestamp")
    
@pytest.mark.asyncio
async def test_delete_project(api_client, db_projects, db_client):
    project_id = db_projects[0]
    response = await api_client.delete(f"/projects/{project_id}")
    assert response.status_code == 200
    
    # Check there are two projects left in the database
    projects = await db_client.get_all_documents("projects")
    assert len(projects) == 2
    
    # Check project with above ID no longer in database
    assert project_id not in [project.get("_id") for project in projects]
    
    
@pytest.mark.asyncio
async def test_create_project(api_client, db_client):
    in_project = {
        "name": "test_project",
        "task": "UFO",
        "query_strategy": "random",
        "data_loader": "image"
    }
    response = await api_client.post("/projects", json=in_project)
    assert response.status_code == 200
    assert (_id := response.json().get("_id"))
    
    # Check it has been added to database
    projects = await db_client.get_all_documents("projects")
    assert len(projects) == 1
    
    for key, value in in_project.items():
        assert projects[0][key] == value
        
    assert str(projects[0]["_id"]) == _id
    assert projects[0].get("timestamp")
    

@pytest.mark.asyncio
async def test_create_project_invalid(api_client, db_client):
    in_project = {
        "name": "test_project",
        "task": "UFOs",
        "data_loader": "files"
        # missing: query_strategy
    }
    response = await api_client.post("/projects", json=in_project)
    assert response.status_code == 422
    errors = response.json().get('detail', [])
    # Should flag that task and data_loader are invalid options, and query_strategy is missing...
    assert len(errors) == 3
    
    # Check it has not been added to database
    projects = await db_client.get_all_documents("projects")
    assert len(projects) == 0
    