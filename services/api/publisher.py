import redis
import json
import os
from services.common.schemas.models import ModelUpdate
from services.common.schemas.samples import SampleUpdate
from services.common.schemas.annotations import AnnotationTypes
import typing

REDIS_HOST = os.environ["REDIS_HOST"]

redis_publisher = redis.Redis(host=f"{REDIS_HOST}", port=6379, db=1)
redis_publisher.flushdb()

def publish_model_progress(
    model_id: str,
    updates: ModelUpdate
):
    message = {"model_id": model_id, "updates": updates.model_dump(mode="json", exclude_unset=True)}
    redis_publisher.publish("models", json.dumps(message))
    
def publish_sample_progress(
    sample_id: str,
    updates: SampleUpdate
):
    message = {"sample_id": sample_id, "updates": updates.model_dump(mode="json", exclude_unset=True)}
    redis_publisher.publish("samples", json.dumps(message))
    
    