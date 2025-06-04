import pymongo
import os
import pydantic

# MONGO_URL = os.environ["MONGO_URL"]
MONGO_URL = "mongodb://root:example@localhost:27017"
DATABASE_NAME = "event_db"
COLLECTION_NAME = "shots"

class MongoDBClient():
    
    def __init__(self, url, db_name):
        self.client = pymongo.AsyncMongoClient(url)
        self.db = self.client[db_name]
        
    async def insert(self, collection, document: pydantic.BaseModel):
        await self.db[collection].insert_one(document.model_dump(mode="python"))
        
    async def insert_many(self, collection, documents: list[pydantic.BaseModel]):
        await self.db[collection].insert_many([document.model_dump(mode="python") for document in documents])
        
    async def get_all_documents(self, collection):
        all_documents = self.db[collection].find()
        return await all_documents.to_list()
        
    async def get_latest_documents(self, collection, number):
        latest_documents = self.db[collection].find().sort("timestamp", pymongo.DESCENDING).limit(number)
        return await latest_documents.to_list(length=number)
    
    async def get_documents_per_project(self, collection, project_id):
        project_documents = self.db[collection].find({"project_id": project_id})
        return await project_documents.to_list()
        
    
    
# Notes to self
# I am planning on doing a collection per route
# Eg Projects, Annotations, Samples, Models etc etc
# These would then be linked via IDs
# So each annotation document would have a 'sample_id' and a 'project_id' for example
# This means that you can search through them using that ID
# Eg above, get_documents_per_project would get you all documents from a collection which are relevant for a certain project

