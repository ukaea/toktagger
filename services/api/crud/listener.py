from redis import asyncio as aioredis
import asyncio
import json
import os
from services.api.crud.db import MongoDBClient
import services.api.crud.utils as utils
from services.common.schemas.models import ModelUpdate

REDIS_HOST = os.environ["REDIS_HOST"]

async def redis_listener(db_client):
    redis = await aioredis.from_url(f"redis://{REDIS_HOST}:6379/1", decode_responses=True)
    redis_listener = redis.pubsub()
    await redis_listener.subscribe("model_progress")
    
    async for message in redis_listener.listen():
        if message["type"] != "message":
            continue

        try:
            data = json.loads(message["data"])
            
            await utils.update_model(
                db_client=db_client,
                model_id=data["model_id"],
                updates=ModelUpdate(**data["updates"])
            )
        except Exception as e:
            print(f"Error handling message: {e}")