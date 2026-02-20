import pathlib
import random
import ray
from toktagger.api.schemas.annotators import AnnotatorTypes
from toktagger.api.schemas.projects import ProjectIn, Task, QueryStrategyType
from toktagger.api.schemas.samples import (
    SampleIn,
    ShotData,
    TimeSeriesFileData,
    ShotProtocol,
    FileType,
    FileProtocol,
)
from toktagger.api.schemas.annotations import (
    TimePoint,
    TimeRegionBatch,
    TimePointBatch,
)
from toktagger.api.schemas.models import ModelIn
from toktagger.api.models.base import Model, ModelRegistry


# Create a mock model for use in our model definitions
@ray.remote
@ModelRegistry.register("mock_disruption_cnn", ["time-series"])
class MockDisruptionCNN(Model):
    def define_model(self):
        return None

    def train(self, samples, annotations, *args, **kwargs):
        self.log_progress(
            training_status="started",
            progress=50,
            score=20,
        )
        return 60

    def predict(self, samples, *args, **kwargs):
        return [
            [
                TimePoint(
                    validated=False,
                    uncertainty=random.random(),
                    label=self.id,
                    time=random.randint(80, 120),
                    created_by=self.type,
                )
            ]
            for i in range(len(samples))
        ]

    def save(self, file_path: str):
        pathlib.Path(file_path).touch()

    def load(self, project, file_path):
        pass


# Define some common things to add to db
PROJECT_1 = ProjectIn(
    name="test_project_0",
    task=Task.SPECTROGRAM,
    query_strategy=QueryStrategyType.SEQUENTIAL,
    data_loader="uda",
)
PROJECT_2 = ProjectIn(
    name="test_project_1",
    task=Task.TIME_SERIES,
    query_strategy=QueryStrategyType.SEQUENTIAL,
    data_loader="tabular",
)
PROJECT_3 = ProjectIn(
    name="project_2",
    task=Task.VIDEO,
    query_strategy=QueryStrategyType.UNCERTAINTY,
    data_loader="image",
)


SAMPLE_1 = SampleIn(
    shot_id=1,
    data=ShotData(protocol=ShotProtocol.UDA, signal_names=["Ip"]),
    annotations=None,
)
SAMPLE_2 = SampleIn(
    shot_id=2,
    data=ShotData(protocol=ShotProtocol.SAL, signal_names=["Ip"]),
    annotations=None,
)
SAMPLE_3 = SampleIn(
    shot_id=3,
    data=TimeSeriesFileData(
        file_name="test.csv",
        type=FileType.CSV,
        protocol=FileProtocol.S3,
        signal_names=["Ip"],
    ),
    annotations=None,
)
SAMPLE_4 = SampleIn(
    shot_id=4,
    data=TimeSeriesFileData(
        file_name=str(pathlib.Path(__file__).parent.joinpath("test.csv").absolute()),
        type=FileType.CSV,
        protocol=FileProtocol.LOCAL,
        signal_names=["Ip"],
    ),
    annotations=None,
)

ANNOTATION_1 = TimeRegionBatch(
    shot_id=1,
    time_min=0.2,
    time_max=0.4,
    label="annotation",
    validated=True,
    created_by=AnnotatorTypes.MANUAL_ANNOTATION,
)
ANNOTATION_2 = TimeRegionBatch(
    shot_id=1,
    time_min=0.1,
    time_max=0.2,
    label="ramp_up",
    validated=True,
    created_by=AnnotatorTypes.MANUAL_ANNOTATION,
)
ANNOTATION_3 = TimePointBatch(
    shot_id=1,
    time=0.1,
    label="disruption",
    validated=False,
    uncertainty=0.6,
    created_by=AnnotatorTypes.PEAK_DETECTION,
)
ANNOTATION_4 = TimePointBatch(
    shot_id=2,
    time=0.3,
    label="disruption",
    validated=False,
    uncertainty=0.4,
    created_by=AnnotatorTypes.PEAK_DETECTION,
)
ANNOTATION_5 = TimePointBatch(
    shot_id=4,
    time=0.4,
    label="disruption",
    validated=False,
    uncertainty=0.8,
    created_by=AnnotatorTypes.PEAK_DETECTION,
)

MODEL_1 = ModelIn(
    type="mock_disruption_cnn",
    version=1,
    training_status="completed",
    progress=100,
    score=80,
)

MODEL_2 = ModelIn(
    type="mock_disruption_cnn",
    version=2,
    training_status="completed",
    progress=100,
    score=90,
)
MODEL_3 = ModelIn(
    type="disruption_cnn",
    version=3,
    training_status="started",
    progress=50,
    score=60,
    task_id="abc123",
)
