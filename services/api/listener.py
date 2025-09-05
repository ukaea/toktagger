import aioredis
import asyncio
import json
import os
from services.api.crud.db import MongoDBClient
from services.api.crud.utils import update_model
from services.api.schemas.models import ModelUpdate

REDIS_HOST = os.environ["REDIS_HOST"]
MONGO_URL = os.environ["MONGO_URL"]
#mongo_url = "mongodb://root:example@localhost:27017"
DB_NAME = "annotate_db"

async def listener():
    db_client = MongoDBClient(MONGO_URL, DB_NAME)
    redis = await aioredis.from_url(f"redis://{REDIS_HOST}:6379/1", decode_responses=True)
    redis_listener = redis.pubsub()
    await redis_listener.subscribe("model_updates")
    
    async for message in redis_listener.listen():
        if message["type"] != "message":
            continue

        try:
            data = json.loads(message["data"])
            await update_model(
                db_client=db_client,
                model_id=data["model_id"],
                updates=ModelUpdate(**data["model_update"])
            )
            print(f"Saved progress: {data}")
        except Exception as e:
            print(f"Error handling message: {e}")

if __name__ == "__main__":
    print("Starting listener...")
    asyncio.run(listener())