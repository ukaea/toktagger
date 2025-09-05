import redis
import json
import os
#from services.api.schemas.models import ModelUpdate

REDIS_HOST = os.environ["REDIS_HOST"]

redis_publisher = redis.Redis(host=f"{REDIS_HOST}", port=6379, db=1)
redis_publisher.flushdb()

def publish_progress(
    model_id: str,
    model_update#: ModelUpdate
):
    message = {"model_id": model_id, "model_update": model_update.model_dump(mode="python")}
    redis_publisher.publish("model_updates", json.dumps(message))