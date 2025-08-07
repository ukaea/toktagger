from services.api.schemas.projects import ProjectIn
from services.api.schemas.annotations import AnnotationIn
from services.api.schemas.samples import SampleIn, ShotData

# Define some common things to add to db
PROJECT = ProjectIn(
        name="test_project_0",
        task="ELM",
        query_strategy="sequential",
        data_loader="uda"
    )
SAMPLE = SampleIn(
        shot_id=0,
        data=ShotData(protocol="uda", signal_names=["Ip"]),
        annotations=None
    ) 

ANNOTATION = AnnotationIn(
    label="annotation",
    validated=True
)