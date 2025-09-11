import requests
from services.common.schemas.samples import SampleUpdateBatchItem
from services.common.schemas.annotations import AnnotationBatchItem
import pydantic
import os
API_URL = os.environ["API_URL"]

def send_batch_updates(url: str, updates: list[pydantic.BaseModel]):
    payload = [model.model_dump(mode="json") for model in updates]
    response = requests.put(
        url=url,
        json=payload
    )
    if response.status_code != 200:
        # TODO what to do here?
        raise RuntimeError(f"Failed to write batch updates with status {response.status_code}")
    
def send_batch_samples(project_id: str, samples: list[SampleUpdateBatchItem]):
    url = f"{API_URL}/projects/{project_id}/samples"
    send_batch_updates(url, samples)
    
def send_batch_annotations(project_id: str, annotations: list[AnnotationBatchItem]):
    url = f"{API_URL}/projects/{project_id}/annotations"
    send_batch_updates(url, annotations)