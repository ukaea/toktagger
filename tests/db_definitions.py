from services.api.schemas.projects import ProjectIn
from services.api.schemas.samples import SampleIn, ShotData

# Define some common things to add to db
PROJECT = ProjectIn(
        name="test_project_0",
        task="ELM",
        query_strategy="random",
        data_loader="uda"
    )
SAMPLE = SampleIn(
        shot_id=1,
        data=ShotData(protocol="uda", signal_names=["Ip"]),
        annotations=None
    ) 