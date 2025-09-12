import requests
from services.api.schemas.samples import SampleUpdateBatchItem
from services.api.schemas.models import ModelUpdate
from services.api.schemas.annotations import AnnotationBatchItem
import pydantic
import os

def send_model_updates(
    project_id: str,
    model_id: str,
    updates: ModelUpdate
):
    url = f"{os.environ['API_URL']}/projects/{project_id}/models/{model_id}"
    response = requests.put(
        url=url,
        json=updates.model_dump(mode="json")
    )
    if response.status_code != 200:
        raise RuntimeError(f"Failed to write model updates with status {response.status_code}")

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
    url = f"{os.environ['API_URL']}/projects/{project_id}/samples"
    send_batch_updates(url, samples)
    
def send_batch_annotations(project_id: str, annotations: list[AnnotationBatchItem]):
    url = f"{os.environ['API_URL']}/projects/{project_id}/annotations"
    send_batch_updates(url, annotations)