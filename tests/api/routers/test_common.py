"""Tests which are common to multiple endpoints which can be parametrized.
"""
import pytest
import asyncio
from bson.objectid import ObjectId
from tests.db_definitions import SAMPLE

# Provide the endpoint you want to be testing
# Anywhere that you want an id inserted, put 'id'
# Then enter the type of object you want tested, eg 'project'
# The code will then figure out where to place correct and incorrect IDs
# Also define the method ('get', 'post', 'put', 'delete') to use,
# and if required provide a valid request body as a dict
@pytest.mark.parametrize("endpoint, test_component, request_method, request_body", [
    ("/projects/id", "project", "get", {}),
    ("/projects/id/samples/id", "project", "get", {}),
    ("/projects/id/samples/id", "sample", "get", {}),
    ("/projects/id/samples", "project", "post", SAMPLE.model_dump(mode="python")),
    ("/projects/id/samples", "sample", "post", SAMPLE.model_dump(mode="python")),
])
@pytest.mark.asyncio
async def test_wrong_id(api_client, db_all, endpoint, test_component, request_method, request_body):
    # Split endpoint up
    components = endpoint.split("/")[1:]
    # Loop through each item in endpoint, check if it needs an ID replacing
    for i in range(0, len(components)-1, 2):
        if components[i+1] != "id":
            continue
        # If this is the component being tested, insert incorrect object ID
        if components[i] == test_component + "s":
            components[i+1] = str(ObjectId())
        # Otherwise, insert valid ID
        else:
            components[i+1] = db_all[components[i]]
            
    endpoint_with_ids = "/".join(components)
    
    if request_method == "get":
        response = await api_client.get(endpoint_with_ids)
    elif request_method == "put":
        response = await api_client.put(endpoint_with_ids, json=request_body)
    elif request_method == "post":
        response = await api_client.post(endpoint_with_ids, json=request_body)
    elif request_method == "delete":
        response = await api_client.delete(endpoint_with_ids)
    else:
        pytest.fail("Test setup failed: invalid request method.")
        
    assert response.status_code == 404
    assert f"{test_component.title()} not found" in response.json().get("detail")
    
# The way this works is you should provide the endpoint you want to be testing
# Anywhere that you want an id inserted, put 'id'
# Then enter the type of object you want tested, eg 'project'
# The code will then figure out where to place correct and incorrect IDs
@pytest.mark.parametrize("endpoint, test_component", [
    ("/projects/id", "project"),
    ("/projects/id/samples/id", "project"),
    ("/projects/id/samples/id", "sample"),
])
@pytest.mark.asyncio
async def test_invalid_id(api_client, db_all, endpoint, test_component):
    # Use an ID which cannot be cast to an ObjectID correctly
    # This error should be caught and raised as an appropriate HTTP response
    components = endpoint.split("/")[1:]
    # Loop through each item in endpoint, check if it needs an ID replacing
    for i in range(0, len(components)-1, 2):
        if components[i+1] != "id":
            continue
        # If this is the component being tested, insert incorrect object ID
        if components[i] == test_component + "s":
            components[i+1] = "invalid_id"
        # Otherwise, insert valid ID
        else:
            components[i+1] = db_all[components[i]]
            
    response = await api_client.get("/".join(components))
    assert response.status_code == 400
    assert 'ID is not valid' in response.json().get("detail")