from toktagger.api.schemas.annotators import AnnotatorTypes
from toktagger.api.schemas.projects import ProjectIn
from toktagger.api.schemas.samples import SampleIn, ShotData, TimeSeriesFileData
from toktagger.api.schemas.annotations import AnnotationIn, TimePoint, TimeRegion
import pathlib

# Define some common things to add to db
PROJECT_1 = ProjectIn(
    name="test_project_0",
    task="disruption",
    query_strategy="sequential",
    data_loader="uda",
)
PROJECT_2 = ProjectIn(
    name="test_project_1",
    task="ELM",
    query_strategy="sequential",
    data_loader="parquet",
)
PROJECT_3 = ProjectIn(
    name="project_2", task="UFO", query_strategy="uncertainty", data_loader="image"
)


SAMPLE_1 = SampleIn(
    shot_id=1, data=ShotData(protocol="uda", signal_names=["Ip"]), annotations=None
)
SAMPLE_2 = SampleIn(
    shot_id=3, data=ShotData(protocol="sal", signal_names=["Ip"]), annotations=None
)
SAMPLE_3 = SampleIn(
    shot_id=2,
    data=TimeSeriesFileData(
        file_name="test.csv", type="csv", protocol="s3", column_names=["Ip"]
    ),
    annotations=None,
)
SAMPLE_4 = SampleIn(
    shot_id=4,
    data=TimeSeriesFileData(
        file_name=str(
            pathlib.Path(__file__).parent.joinpath("10000.parquet").absolute()
        ),
        type="parquet",
        protocol="file",
        column_names=["Ip"],
    ),
    annotations=None,
)


ANNOTATION_1 = AnnotationIn(
    label="annotation", validated=True, created_by=AnnotatorTypes.MANUAL_ANNOTATION
)
ANNOTATION_2 = TimeRegion(
    time_min=0.1,
    time_max=0.2,
    label="ramp_up",
    validated=True,
    created_by=AnnotatorTypes.MANUAL_ANNOTATION,
)
ANNOTATION_3 = TimePoint(
    time=0.1,
    label="disruption",
    validated=False,
    uncertainty=0.6,
    created_by=AnnotatorTypes.PEAK_DETECTION,
)
ANNOTATION_4 = TimePoint(
    time=0.3,
    label="disruption",
    validated=False,
    uncertainty=0.4,
    created_by=AnnotatorTypes.PEAK_DETECTION,
)
ANNOTATION_5 = TimePoint(
    time=0.4,
    label="disruption",
    validated=False,
    uncertainty=0.8,
    created_by=AnnotatorTypes.PEAK_DETECTION,
)
