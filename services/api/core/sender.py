import requests
from services.api.schemas.samples import SampleUpdateBatchItem
from services.api.schemas.models import ModelUpdate
from services.api.schemas.annotations import AnnotationBatchItem
import typing
import os


def send_model_updates(project_id: str, model_id: str, updates: ModelUpdate) -> None:
    """Send updates about model training status from worker node to server via API.

    Parameters
    ----------
    project_id : str
        The ID of the project which this model is associated with
    model_id : str
        The ID of the model to update
    updates : ModelUpdate
        Updates about the model to be sent - parameters which are unset or None will be ignored

    Raises
    ------
    RuntimeError
        Raised if the server returns an error when updating the model
    """
    url = f"{os.environ['API_URL']}/projects/{project_id}/models/{model_id}"
    response = requests.put(url=url, json=updates.model_dump(mode="json"))
    if response.status_code != 200:
        raise RuntimeError(
            f"Failed to write model updates with status {response.status_code}"
        )


def send_batch_updates(
    url: str, updates: list[typing.Union[SampleUpdateBatchItem, AnnotationBatchItem]]
):
    """Send a batch of items from worker node to a provided URL.

    Parameters
    ----------
    url : str
        The URL to send the items to
    updates : list[typing.Union[SampleUpdateBatchItem, AnnotationBatchItem]]
        Updates to be sent to the server - parameters which are unset or None will be ignored

    Raises
    ------
    RuntimeError
        Raised if the server returns an error when updating the model
    """
    payload = [model.model_dump(mode="json") for model in updates]
    response = requests.put(url=url, json=payload)
    if response.status_code != 200:
        # TODO what to do here?
        raise RuntimeError(
            f"Failed to write batch updates with status {response.status_code}"
        )


def send_batch_samples(project_id: str, samples: list[SampleUpdateBatchItem]):
    """Send a batch of sample updates from worker node to server via API.

    Parameters
    ----------
    project_id : str
        The ID of the project to update samples for
    samples : list[SampleUpdateBatchItem]
        Updates to be sent to the server - parameters which are unset or None will be ignored
    """
    url = f"{os.environ['API_URL']}/projects/{project_id}/samples"
    send_batch_updates(url, samples)


def send_batch_annotations(project_id: str, annotations: list[AnnotationBatchItem]):
    """Send a batch of new annotations from worker node to server via API.

    Parameters
    ----------
    project_id : str
        The ID of the project to update annotations for
    samples : list[AnnotationBatchItem]
        Annotations to be sent to the server
    """
    url = f"{os.environ['API_URL']}/projects/{project_id}/annotations"
    send_batch_updates(url, annotations)
