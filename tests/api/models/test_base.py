from unittest.mock import patch

import pytest

pytest.importorskip("ray")

from tests.db_definitions import PROJECT_1
from tests.models_definitions import TimeSeriesCNN
from toktagger.api.core.data_loaders import TabularDataLoader
from toktagger.api.models.base import ModelProgressCallback
from toktagger.api.schemas.models import ModelUpdate
from toktagger.api.schemas.projects import Project

pytestmark = pytest.mark.models_enabled


def make_model(progress_callback: ModelProgressCallback | None = None):
    project = Project(**PROJECT_1.model_dump(), id="test_project_id")
    # Loader discovery still needs Ray until the reader contract is extracted.
    with (
        patch("toktagger.api.models.base.ray.get_actor"),
        patch("toktagger.api.models.base.ray.get", return_value=TabularDataLoader),
    ):
        return TimeSeriesCNN(
            model_id="test_model_id",
            project=project,
            progress_callback=progress_callback,
        )


def test_model_reports_training_progress_to_callback():
    updates: list[ModelUpdate] = []
    model = make_model(progress_callback=updates.append)

    score = model.wrapped_train(samples=[], annotations=[], params=None)

    assert score == 60
    assert len(updates) == 1
    update = updates[0]
    assert isinstance(update, ModelUpdate)
    assert update.status == "training"
    assert update.progress == 50
    assert update.score == 20


def test_model_can_train_without_progress_callback():
    model = make_model()

    assert model.wrapped_train(samples=[], annotations=[], params=None) == 60


def test_model_does_not_hide_progress_callback_errors():
    def fail_callback(update: ModelUpdate) -> None:
        raise RuntimeError("Progress receiver unavailable")

    model = make_model(progress_callback=fail_callback)

    with pytest.raises(RuntimeError, match="Progress receiver unavailable"):
        model.wrapped_train(samples=[], annotations=[], params=None)
