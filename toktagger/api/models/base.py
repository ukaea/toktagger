from toktagger.api.schemas.samples import Sample
from toktagger.api.schemas.annotations import Annotation, AnnotationBase
from toktagger.api.schemas.projects import Project, Task
from sklearn.model_selection import train_test_split
from abc import ABC, abstractmethod
import typing
import math
from toktagger.api.core.sender import send_model_updates
from toktagger.api.schemas.models import ModelUpdate
import importlib.util
import uuid
import logging

logger = logging.getLogger("ray")


def models_dependencies_installed() -> bool:
    return (
        importlib.util.find_spec("torch") is not None
        and importlib.util.find_spec("ray") is not None
    )


if models_dependencies_installed():
    import ray


class Model(ABC):
    def __init__(
        self,
        model_id: str,
        project: Project,
    ) -> None:
        self.id = model_id
        self.project = project
        self.model = self.define_model()
        self.type = ModelRegistry.get_name(self.__class__)

    def log_progress(
        self,
        training_status: typing.Literal[
            "queued", "started", "failed", "completed", "aborted"
        ]
        | None = None,
        progress: float | None = None,
        score: float | None = None,
    ):
        model_update = ModelUpdate(
            training_status=training_status, progress=progress, score=score
        )
        send_model_updates(self.project.id, self.id, model_update)

    def split_data(
        self,
        samples: list[Sample],
        annotations: list[list[Annotation]],
        train_val_test_split: typing.Tuple[float, float, float],
    ) -> None:
        if len(samples) != len(annotations):
            raise ValueError("Annotations missing for some samples!")
        if not math.isclose(sum(train_val_test_split), 1):
            raise ValueError("Ratios in train_val_test split must sum to 1!")

        train_fraction, val_fraction, test_fraction = train_val_test_split

        if train_fraction == 0:
            raise ValueError("Must be samples in the training set!")

        # If train ratio is 1, no splitting required, just set train sets and return
        if train_fraction == 1:
            self.train_samples = samples
            self.train_annotations = annotations
            self.val_samples = None
            self.val_annotations = None
            self.test_samples = None
            self.test_annotations = None
            return

        # Otherwise need to do some splitting, split into train set and (val + test) set
        train_samples, val_test_samples, train_annotations, val_test_annotations = (
            train_test_split(
                samples, annotations, test_size=val_fraction + test_fraction
            )
        )
        self.train_samples = train_samples
        self.train_annotations = train_annotations

        # If no validation split requested, return test set
        if not val_fraction:
            self.val_samples = None
            self.val_annotations = None
            self.test_samples = val_test_samples
            self.test_annotations = val_test_annotations

        # If no test split requested, return val set
        elif not test_fraction:
            self.val_samples = val_test_samples
            self.val_annotations = val_test_samples
            self.test_samples = None
            self.test_annotations = None

        # Otherwise split again and return both val and test sets
        else:
            (
                self.val_samples,
                self.test_samples,
                self.val_annotations,
                self.test_annotations,
            ) = train_test_split(
                val_test_samples,
                val_test_annotations,
                test_size=test_fraction / (val_fraction + test_fraction),
            )

    @abstractmethod
    def define_model(self):
        pass

    @abstractmethod
    def train(
        self,
        samples: list[Sample],
        annotations: list[list[Annotation]],
        train_val_test_split: typing.Tuple[float, float, float],
        num_epochs: int = 100,
    ) -> float:
        # pass in list of samples and list of annotations
        # return some measure of accuracy
        pass

    @abstractmethod
    def predict(self, samples: list[Sample]) -> list[list[AnnotationBase]]:
        # pass in list of samples and list of annotations (could be size 1)
        # returns list / array / tensor of predictions and uncertainties
        pass

    @abstractmethod
    def save(self, file_path: str):
        pass

    @abstractmethod
    def load(cls, project: Project, file_path: str):
        pass


class ModelRegistry:
    _registry: dict[str, Model] = {}
    _tasks: dict[str, list[Task]] = {}

    @classmethod
    def register(cls, name: str, tasks: list[Task | str]):
        def decorator(model_class: Model):
            if not issubclass(model_class, Model):
                raise ValueError(
                    f"Loader '{name}' does not inherit from Model base class."
                )
            cls._registry[name] = model_class
            cls._tasks[name] = [Task(_task) for _task in tasks]

            return model_class

        return decorator

    @classmethod
    def get(cls, name: str):
        print(cls._registry)
        model_class: Model | None = cls._registry.get(name)
        if not model_class:
            raise ValueError(f"No Model class called '{name}' found in registry!")
        return ray.remote(model_class)

    @classmethod
    def get_name(cls, model_class: Model):
        return next(
            name
            for name, model in cls._registry.items()
            if model_class.__class__.__name__ == model.__class__.__name__
        )

    @classmethod
    def names(cls, task: Task | None = None):
        if not task:
            return list(cls._registry.keys())
        return [name for name, tasks in cls._tasks.items() if task in tasks]

    @classmethod
    def tasks(cls, name: str):
        tasks: list[Task] | None = cls._tasks.get(name)
        if not tasks:
            raise ValueError(f"No tasks associated with model '{name}'!")
        return tasks


@ray.remote
class WorkerModelRegistry:
    def __init__(self, registry):
        self._registry: dict[str, Model] = registry

    def get(self, name):
        model_class: Model | None = self._registry.get(name)
        if not model_class:
            raise ValueError(f"No Model class called '{name}' found in registry!")
        return ray.remote(model_class)


class TaskRegistry:
    """Registry to keep track of Ray actors, and the task they are associated with."""

    def __init__(self, max_actors: int):
        """Create task registry

        Parameters
        ----------
        max_actors : int
            Maximum number of actors to keep alive simultaneously
        """
        self.max_actors = max_actors
        self.tasks = {}
        self.actors = []

    def register(self, task_ref: ray.ObjectRef) -> str:
        """Store a Ray task reference in the registry and associate with a UUID.

        Parameters
        ----------
        task_ref : ray.ObjectRef
            The reference to the Ray task

        Returns
        -------
        str
            A unique identifier for this task
        """
        task_id = str(uuid.uuid4())
        self.tasks[task_id] = task_ref
        return task_id

    def get(self, task_id: str) -> ray.ObjectRef | None:
        """Convert a task ID back into the Ray task reference

        Parameters
        ----------
        task_id : str
            The unique identifier for this task

        Returns
        -------
        ray.ObjectRef | None
            The Ray task reference, if it exists in the Registry
        """
        return self.tasks.get(task_id)

    def update_actors(self, actor_name: str) -> None:
        """Record that a Ray Actor has been accessed, and kill any stale Actors.

        Parameters
        ----------
        actor_name : str
            The name of the Ray Actor
        """
        if actor_name in self.actors:
            self.actors.remove(actor_name)

        self.actors.append(actor_name)

        if len(self.actors) > self.max_actors:
            stale_actor = self.actors.pop(0)
            try:
                actor = ray.get_actor(stale_actor)
                ray.kill(actor)
            except ValueError:
                return
