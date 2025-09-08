from redis import asyncio as aioredis
import asyncio
import json
import os
from services.api.crud.db import MongoDBClient
import services.api.crud.utils as utils
from services.api.schemas.models import ModelUpdate
from services.api.schemas.samples import SampleUpdate

REDIS_HOST = os.environ["REDIS_HOST"]
MONGO_URL = os.environ["MONGO_URL"]
#mongo_url = "mongodb://root:example@localhost:27017"
DB_NAME = "annotate_db"

async def listener():
    db_client = MongoDBClient(MONGO_URL, DB_NAME)
    redis = await aioredis.from_url(f"redis://{REDIS_HOST}:6379/1", decode_responses=True)
    redis_listener = redis.pubsub()
    await redis_listener.subscribe("models", "samples", "annotations")
    
    async for message in redis_listener.listen():
        if message["type"] != "message":
            continue

        try:
            data = json.loads(message["data"])
            
            if message["channel"] == "models":
                await utils.update_model(
                    db_client=db_client,
                    model_id=data["id"],
                    updates=ModelUpdate(**data["updates"])
                )
            elif message["channel"] == "samples":
                await utils.update_sample(
                    db_client=db_client,
                    sample_id=data["id"],
                    updates=SampleUpdate(**data["updates"])
                )
        except Exception as e:
            print(f"Error handling message: {e}")

if __name__ == "__main__":
    print("Starting listener...")
    asyncio.run(listener())