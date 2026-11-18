import os

import requests

from toktagger.api.schemas.models import ModelUpdate

# Bounds how long a worker or actor blocks on a stalled API before giving up
REQUEST_TIMEOUT_SECONDS = 60


def send_model_updates(
    project_id: str, model_id: str, updates: ModelUpdate
) -> requests.Response | None:
    """Send updates about model training status from worker node to server via API.

    Parameters
    ----------
    project_id : str
        The ID of the project which this model is associated with
    model_id : str
        The ID of the model to update
    updates : ModelUpdate
        Updates about the model to be sent - parameters which are unset or None will be ignored
    """
    api_url = os.environ.get("API_URL")
    if not api_url:
        return None

    headers = {}
    # Internal token injected by the server; only the model status route accepts it.
    if api_token := os.environ.get("API_TOKEN"):
        headers["Authorization"] = f"Bearer {api_token}"

    return requests.put(
        url=f"{api_url}/projects/{project_id}/models/{model_id}",
        json=updates.model_dump(mode="json"),
        headers=headers,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
