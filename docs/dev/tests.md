# Unit Tests
Each new feature added to the repository should have unit tests added to ensure that its basic functionality is working as expected. For the backend tests, we use `pytest` for this.

## Running the tests
To run the tests, you need to install the development environment with `uv`:

```
uv venv --python 3.12.6
source .venv/bin/activate
uv sync
pytest
```

## Test Structure
The tests check functionality at the following levels:

### Core code

Tests that functionality such as the annotators, data loaders and query strategies work. These typically use dummy data and do not require an instance of the database to be running.

### Database code

 Tests that the functionality of the MongoDB Client and helper functions work as expected. These require an instance of the database to be running, with set objects automatically instantiated and used to populate the database. A MongoDB docker container is run using `testcontainers` to spin up the database - note that you will need `docker` on your system to use this. 

 The objects which are instantiated for entry into the database are defined inside `tests/db_definitions.py`. Any schema definitions which are reused in multiple tests should be located here. **Be aware that any changes made to these definitions will likely cause other tests to break!**

 To get access to the instance of the `MongoDBClient` to query the database, you should use the fixture `db_client` in your test.

 To add all of the objects defined inside `db_definitions` into the database, use the fixture `setup_db` in your test. This will return you a dictionary of all of the IDs of each object entered into the DB if you need access to these in your tests. All of these objects are automatically cleaned out of the database at teardown of each test.


 You can get a smaller version of the database which is useful for some tests by using the fixture `setup_db_small`. This just instantiates one project, sample and annotation.

### API Code

 Tests are written which check the functionality of each API endpoint. These use a test API client provided by `httpx`. Note that we cannot use `fastapi`'s `TestClient` as this does not work properly in asynchronous mode which is required for the `MongoDBClient` to work.

 To use this, add the fixture `api_client` to your tests. Use this in the same way you would use the `requests` library, eg by using `api_client.post(url=..., json=...)`. This will automatically connect to the database client so that queries work correctly. You can still also use the fixtures `setup_db` or `setup_db_small` to create objects in the database for the API to query.

