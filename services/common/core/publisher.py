import os
import redis
from services.common.schemas.models import ModelUpdate
import json


REDIS_HOST = os.environ.get("REDIS_HOST", "redis")

redis_publisher = redis.Redis(host=f"{REDIS_HOST}", port=6379, db=1)

def publish_progress(
    model_id: str,
    updates: ModelUpdate
):
    message = {"model_id": model_id, "updates": updates.model_dump(mode="json", exclude_unset=True)}
    redis_publisher.publish("model_progress", json.dumps(message))