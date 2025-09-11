import os
import redis
from services.common.schemas.models import ModelUpdate
import json


REDIS_HOST = os.environ["REDIS_HOST"]

redis_publisher = redis.Redis(host=f"{REDIS_HOST}", port=6379, db=1)
redis_publisher.flushdb()

def publish_progress(
    model_id: str,
    updates: ModelUpdate
):
    message = {"model_id": model_id, "updates": updates.model_dump(mode="json", exclude_unset=True)}
    redis_publisher.publish("model_progress", json.dumps(message))