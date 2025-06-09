import pymongo
import os
import pydantic
import typing

# MONGO_URL = os.environ["MONGO_URL"]
MONGO_URL = "mongodb://root:example@localhost:27017"
DATABASE_NAME = "event_db"
COLLECTION_NAME = "shots"

class MongoDBClient():
    
    def __init__(self, url: str, db_name: str):
        self.client = pymongo.AsyncMongoClient(url)
        self.db = self.client[db_name]
        
    async def insert(
        self, 
        collection: typing.Literal["projects", "annotations", "models", "samples"], 
        model: pydantic.BaseModel, 
        ids: dict = None
    ):
        document = model.model_dump(mode="python")
        document.update(ids)
        await self.db[collection].insert_one(document)
        
    async def insert_many(
        self, 
        collection: typing.Literal["projects", "annotations", "models", "samples"], 
        models: list[pydantic.BaseModel], 
        ids: dict = None
    ):
        documents = [model.model_dump(mode="python") for model in models]
        documents  = [{**document, **ids} for document in documents]
        await self.db[collection].insert_many(documents)
        
    async def get_all_documents(
        self, 
        collection: typing.Literal["projects", "annotations", "models", "samples"]
    ):
        all_documents = self.db[collection].find()
        return await all_documents.to_list()
    
    async def get_filtered_documents(
        self, 
        collection: typing.Literal["projects", "annotations", "models", "samples"], 
        filters: dict = {}, 
        sort_by: str = "timestamp", 
        sort_direction: typing.Literal[1, -1] = -1, 
        start=0, 
        limit=0
    ):
        project_documents = self.db[collection].find(filters).sort(sort_by, sort_direction).skip(start).limit(limit)
        return await project_documents.to_list()
    
    async def delete_filtered_documents(
        self, 
        collection: typing.Literal["projects", "annotations", "models", "samples"],
        filters: dict = {},
    ):
        await self.db[collection].delete_many(filters)
    
# Notes to self
# I am planning on doing a collection per route
# Eg Projects, Annotations, Samples, Models etc etc
# These would then be linked via IDs
# So each annotation document would have a 'sample_id' and a 'project_id' for example
# This means that you can search through them using that ID
# Eg above, get_documents_per_project would get you all documents from a collection which are relevant for a certain project

