import pytest
import asyncio
from bson.objectid import ObjectId

@pytest.mark.asyncio
async def test_get_all_samples(api_client, setup_db):
    response = await api_client.get(f"/projects/{setup_db['project_id_1']}/samples")
    assert response.status_code == 200
    returned_samples= response.json()
    import pdb; pdb.set_trace()
    assert [sample['shot_id'] for sample in returned_samples] == [0, 1, 2]
    assert [sample['_id'] for sample in returned_samples] == [setup_db["sample_id_1"], setup_db["sample_id_2"], setup_db["sample_id_3"]]
    
@pytest.mark.asyncio
async def test_get_samples_start(api_client, setup_db):
    response = await api_client.get(f"/projects/{setup_db['project_id_1']}/samples?start=1")
    # Should return 2 samples
    assert response.status_code == 200
    returned_samples = response.json()
    assert len(returned_samples) == 2
    assert [sample['shot_id'] for sample in returned_samples] == [1, 2]
    
@pytest.mark.asyncio
async def test_get_samples_end(api_client, setup_db):
    response = await api_client.get(f"/projects/{setup_db['project_id_1']}/samples?end=1")
    # Should return 2 projects
    assert response.status_code == 200
    returned_samples = response.json()
    assert len(returned_samples) == 2
    assert [sample['shot_id'] for sample in returned_samples] == [0, 1]
    
@pytest.mark.asyncio
async def test_get_samples_start_end(api_client, setup_db):
    response = await api_client.get(f"/projects/{setup_db['project_id_1']}/samples?start=1&end=1")
    # Should return 1 project
    assert response.status_code == 200
    returned_samples = response.json()
    assert len(returned_samples) == 1
    assert [sample['shot_id'] for sample in returned_samples] == [1]
    
@pytest.mark.asyncio
async def test_get_samples_invalid_start(api_client, setup_db):
    response = await api_client.get(f"/projects/{setup_db['project_id_1']}/samples?start=10")
    # Should return 0 projects
    assert response.status_code == 200
    returned_samples = response.json()
    assert len(returned_samples) == 0
    
@pytest.mark.asyncio
async def test_get_samples_invalid_start_lessthan_end(api_client, setup_db):
    response = await api_client.get(f"/projects/{setup_db['project_id_1']}/samples?start=2&end=1")
    # Should raise a bad request exception
    assert response.status_code == 400
    assert 'Invalid parameters - end must be higher than start' in response.json().get("detail")
    
@pytest.mark.asyncio
async def test_get_sample_id(api_client, setup_db):
    response = await api_client.get(f"/projects/{setup_db['project_id_1']}/samples/{setup_db['sample_id_1']}")
    assert response.status_code == 200
    returned_sample = response.json()
    # Check info matches what we created the entry with
    assert returned_sample.get("shot_id") == 0
    assert returned_sample.get("protocol") == 'UDA'
    assert returned_sample.get("signal_names") == ["Ip"]
    
    # Then also check ID and timestamp are returned - should have been added automatically
    assert returned_sample.get("_id") == setup_db['sample_id_1']
    assert returned_sample.get("project_id") == setup_db['project_id_1']
    assert returned_sample.get("timestamp")
    
@pytest.mark.asyncio
async def test_delete_sample(api_client, setup_db, db_client):
    response = await api_client.delete(f"/projects/{setup_db['project_id_2']}/samples/{setup_db['sample_id_4']}")
    assert response.status_code == 200
    
    # Check there are three samples left in the database
    samples = await db_client.get_all_documents("projects")
    assert len(samples) == 3
    # Check sample with above ID no longer in database
    assert setup_db['sample_id_4'] not in [sample.get("_id") for sample in samples]
    
    # Check annotations associated with this project have been deleted
    annotations = await db_client.get_all_documents("annotations")
    assert len(annotations) == 3
    # Check annotation associated with above project no longer in database
    assert setup_db['annotation_id_4'] not in [annotation.get("_id") for annotation in annotations]
    
    # Check that project assocaited with this sample has NOT been deleted
    projects = await db_client.get_all_documents("projects")
    assert len(projects) == 3
    # Check project with above ID is in database
    assert setup_db['project_id_2'] in [project.get("_id") for project in projects]
    
async def get_next_sample(api_client, setup_db):
    response = await api_client.get(f"/projects/{setup_db['project_id_1']}/samples/next")
    assert response.status_code == 200
    returned_sample = response.json()
    # Should return me the sample with the next shot ID sequentially which has not been annotated
    # Sample 1 has been annotated, so sample 2 should be returned...
    assert returned_sample.get("shot_id") == 1
    assert returned_sample.get("protocol") == 'file'
    assert returned_sample.get("type") == 'csv'
    assert returned_sample.get("file_name") == 'test.csv'
    assert returned_sample.get("column_names") == ["Ip"]
    
    # Then also check ID and timestamp are returned - should have been added automatically
    assert returned_sample.get("_id") == setup_db['sample_id_2']
    assert returned_sample.get("project_id") == setup_db['project_id_1']
    assert returned_sample.get("timestamp")

@pytest.mark.asyncio
async def test_create_samples(api_client, setup_db, db_client):
    in_samples = [
        {
            "shot_id": 4,
            "data": {
                "protocol": "uda",
                "signal_names": ["Ip", "dalpha"],
            }
        },
        {
            "shot_id": 5,
            "data": {
                "protocol": "file",
                "type": "parquet",
                "file_name": "test.parquet",
                "column_names": ["Ip", "dalpha"],
            }
        }
    ]
    response = await api_client.put(f"/projects/{setup_db['project_id_1']}/samples", json=in_samples)
    assert response.status_code == 200
        
    # Check they have been added to database
    samples = await db_client.get_all_documents("samples")
    assert len(samples) == 6
    
    for in_sample in in_samples:
        db_sample = db_client.get_filtered_documents("samples", filters={"shot_id": in_sample["shot_id"]})[0]
        for key, value in in_sample.items():
            assert db_sample[key] == value
        
        assert db_sample.get("timestamp")
        assert db_sample.get("_id")
        assert db_sample.get("project_id") == setup_db['project_id_1']
    

@pytest.mark.asyncio
async def test_create_project_invalid(api_client, setup_db, db_client):
    in_samples = [
        {
            "shot_id": "5",
            "data": {
                "protocol": "unrecognized",
                "signal_names": "Ip",
            },
            "some_other_key": 10
        },
    ]
    response = await api_client.post(f"/projects/{setup_db['project_id_1']}/samples", json=in_samples)
    assert response.status_code == 422
    errors = response.json().get('detail', [])
    # Should flag that shot_id and signal_names are wrong type, protocol is invalid, extra key specified
    assert len(errors) == 4
    
    # Check it has not been added to database
    samples = await db_client.get_all_documents("samples")
    assert len(samples) == 4
    