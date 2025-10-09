from services.api.schemas.samples import Sample
from services.api.schemas.annotations import Annotation, AnnotationIn
from services.api.schemas.projects import Project
from services.api.schemas.models import ModelType
from sklearn.model_selection import train_test_split
from abc import ABC, abstractmethod
import typing
import math
from services.api.core.sender import send_model_updates
from services.api.schemas.models import ModelUpdate


class Model(ABC):
    def __init__(
        self,
        model_id: str,
        project: Project,
    ) -> None:
        self.id = model_id
        self.project = project
        self.model = self.define_model()
        self.type = ModelType[self.__class__.__name__]

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
    def predict(self, samples: list[Sample]) -> list[list[AnnotationIn]]:
        # pass in list of samples and list of annotations (could be size 1)
        # returns list / array / tensor of predictions and uncertainties
        pass

    @abstractmethod
    def save(self, file_path: str):
        pass

    @abstractmethod
    def load(cls, project: Project, file_path: str):
        pass
