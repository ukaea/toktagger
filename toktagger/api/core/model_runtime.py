import os
import uuid
from collections import OrderedDict
from dataclasses import dataclass

import requests

from toktagger.api.models import models_dependencies_installed
from toktagger.api.schemas.models import ModelUpdate

if models_dependencies_installed():
    import ray


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


@dataclass(frozen=True)
class ServerModelProgress:
    project_id: str
    model_id: str

    def __call__(self, update: ModelUpdate) -> None:
        send_model_updates(self.project_id, self.model_id, update)


@ray.remote(num_cpus=0.1)
class WorkerRegistry:
    def __init__(self, registry):
        self._registry: dict[str, type] = registry

    def get(self, name):
        registered: type | None = self._registry.get(name)
        if not registered:
            raise ValueError(f"No class called '{name}' found in registry!")
        return registered


@ray.remote(num_cpus=0.1)
class ActorRegistry:
    """Registry to keep track of Ray actors, and the task they are associated with.

    Runs as a single named, detached Ray actor shared by all uvicorn workers,
    so actor limits and task IDs are tracked cluster-wide rather than
    independently per worker process.
    """

    def __init__(self, max_actors: int, max_gpu_actors: int):
        """Create task registry

        Parameters
        ----------
        max_actors : int
            Maximum number of actors to keep alive simultaneously
        max_gpu_actors : int
            Maximum number of GPU actors to keep alive simultaneously
        """

        if max_actors < 1:
            raise ValueError(
                "Insufficient CPU cores available for ML model functionality"
            )

        self._gpu_enabled = max_gpu_actors > 0
        self.max_actors = max_actors
        self.max_gpu_actors = max_gpu_actors
        self.tasks = {}
        self.actors = OrderedDict()

    def gpu_enabled(self) -> bool:
        return self._gpu_enabled

    def list_actors(self) -> list[str]:
        return list(self.actors.keys())

    def register(
        self, task_ref: list[ray.ObjectRef], task_id: str | None = None
    ) -> str:
        """Store a Ray task reference in the registry and associate with an ID.

        Parameters
        ----------
        task_ref : list[ray.ObjectRef]
            The task reference, wrapped in a list. Ray resolves a bare ObjectRef
            passed to a remote call as a dependency and blocks until it finishes,
            which would defeat polling it later via is_ready/get_result; a list
            keeps it opaque to that.
        task_id : str | None
            The ID to store the task under, generated automatically if not given

        Returns
        -------
        str
            The identifier for this task
        """
        task_id = task_id or str(uuid.uuid4())
        self.tasks[task_id] = task_ref[0]
        return task_id

    def is_ready(self, task_id: str) -> bool | None:
        """Non-blocking check of whether a task has finished.

        Runs inside the actor because Ray auto-dereferences any ObjectRef this
        method would otherwise hand back across the actor boundary.

        Returns
        -------
        bool | None
            True/False if the task is known, None if task_id isn't registered
        """
        task_ref = self.tasks.get(task_id)
        if task_ref is None:
            return None
        ready, _ = ray.wait([task_ref], timeout=0)
        return bool(ready)

    def get_result(self, task_id: str):
        """Blocking fetch of a finished task's result (raises if the task raised)."""
        return ray.get(self.tasks[task_id])

    def cancel(self, task_id: str) -> None:
        """Cancel a registered task, if it exists.

        Forces the cancel: a cooperative one only raises at the task's next
        bytecode instruction, which never arrives for a task blocked in a
        C-level call (e.g. time.sleep), leaving its worker slot stuck.
        """
        task_ref = self.tasks.get(task_id)
        if task_ref is not None:
            ray.cancel(task_ref, force=True)

    def update_actors(self, actor_name: str, use_gpu: bool) -> None:
        """Record that a Ray Actor has been accessed, and kill any stale Actors.

        Parameters
        ----------
        actor_name : str
            The name of the Ray Actor
        """
        if use_gpu and not self._gpu_enabled:
            raise ValueError("GPU requested but GPU support is not enabled on server")

        # Set this actor to be the most recently used
        if actor_name in self.actors:
            self.actors.move_to_end(actor_name)
        else:
            self.actors[actor_name] = use_gpu

        if not self.actors[actor_name] and use_gpu:
            # CPU actor may be upgraded to GPU (but not other way round)
            self.actors[actor_name] = use_gpu

        stale_actor = None
        # Check GPU limit first
        gpu_count = sum(1 for gpu in self.actors.values() if gpu)
        if self._gpu_enabled and gpu_count > self.max_gpu_actors:
            # Find first actor which requires GPU
            stale_actor = next(
                (actor for actor, gpu in self.actors.items() if gpu), None
            )
            if not stale_actor:
                raise ValueError("GPU count exceeds maximum, but no GPU actor found!")
            self.actors.pop(stale_actor)

        # Then check overall tasks limit
        elif len(self.actors) > self.max_actors:
            stale_actor, _ = self.actors.popitem(last=False)

        if stale_actor:
            try:
                actor = ray.get_actor(stale_actor)
                # Queue a kill job, letting any other in progress tasks finish first
                actor.__ray_terminate__.remote()
            except ValueError:
                return
