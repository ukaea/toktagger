"""Tests which are common to multiple endpoints which can be parametrized.
"""
import pytest
import asyncio
from bson.objectid import ObjectId

# The way this works is you should provide the endpoint you want to be testing
# Anywhere that you want an id inserted, put 'id'
# Then enter the type of object you want tested, eg 'project'
# This will replace
# The code will then figure out where to place correct and incorrect IDs
@pytest.mark.parametrize("endpoint, test_component", [
    ("/projects/id", "project"),
    ("/projects/id/samples/id", "project"),
    ("/projects/id/samples/id", "sample"),
])
@pytest.mark.asyncio
async def test_get_wrong_id(api_client, db_all, endpoint, test_component):
    # Split endpoint up
    components = endpoint.split("/")[1:]
    # Loop through each item in endpoint, check if it needs an ID replacing
    for i in range(0, len(components)-1, 2):
        if components[i+1] != "id":
            continue
        # If this is the component being testedm insert incorrect object ID
        if components[i] == test_component + "s":
            components[i+1] = str(ObjectId())
        # Otherwise, insert valid ID
        else:
            components[i+1] = db_all[components[i]]
    import pdb; pdb.set_trace()
    response = await api_client.get("/".join(components))
    assert response.status_code == 404
    assert f"{test_component.title()} not found" in response.json().get("detail")
    
@pytest.mark.asyncio
async def test_get_project_invalid_id(api_client, db_projects):
    # Use an ID which cannot be cast to an ObjectID correctly
    # This error should be caught and raised as an appropriate HTTP response
    # Eg, try using the project's name instead of its ID:
    response = await api_client.get("/projects/test_project_0")
    assert response.status_code == 400
    assert 'ID is not valid' in response.json().get("detail")   
    
    
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