import requests
from toktagger.api.schemas.samples import SampleUpdateBatchItem
from toktagger.api.schemas.models import ModelUpdate
from toktagger.api.schemas.annotations import AnnotationBatchTypes
import typing
import os


def send_updates(
    object_type: str,
    url: str,
    updates: ModelUpdate
    | list[typing.Union[SampleUpdateBatchItem, AnnotationBatchTypes]],
) -> None:
    """Send a single item or batch of items from worker node to a provided URL.

    Parameters
    ----------
    object_type: str
        The type of object you are sending updates for (eg 'models', 'samples', 'annotations')
    url : str
        The URL to send the items to
    updates : ModelUpdates | list[typing.Union[SampleUpdateBatchItem, AnnotationBatchInputTypes]]
        Updates to be sent to the server - parameters which are unset or None will be ignored

    Raises
    ------
    RuntimeError
        Raised if the server returns an error when updating the model
    """
    if isinstance(updates, list):
        payload = [model.model_dump(mode="json") for model in updates]
    else:
        payload = updates.model_dump(mode="json")

    response = requests.put(url=url, json=payload)
    if response.status_code != 200:
        # TODO what to do here?
        raise RuntimeError(
            f"Failed to write updates for {object_type} with status {response.status_code}"
        )


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
    send_updates("model", url, updates=updates)


def send_batch_samples(project_id: str, samples: list[SampleUpdateBatchItem]) -> None:
    """Send a batch of sample updates from worker node to server via API.

    Parameters
    ----------
    project_id : str
        The ID of the project to update samples for
    samples : list[SampleUpdateBatchItem]
        Updates to be sent to the server - parameters which are unset or None will be ignored
    """
    url = f"{os.environ['API_URL']}/projects/{project_id}/samples"
    send_updates("samples", url, samples)


def send_batch_annotations(
    project_id: str, annotations: list[AnnotationBatchTypes]
) -> None:
    """Send a batch of new annotations from worker node to server via API.

    Parameters
    ----------
    project_id : str
        The ID of the project to update annotations for
    annotations : list[AnnotationBatchInputTypes]
        Annotations to be sent to the server
    """
    url = f"{os.environ['API_URL']}/projects/{project_id}/annotations"
    send_updates("annotations", url, annotations)
