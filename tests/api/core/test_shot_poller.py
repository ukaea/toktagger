from datetime import datetime, timedelta

import pytest
from bson import ObjectId

from tests.db_definitions import PROJECT_1, PROJECT_2
from toktagger.api import config
from toktagger.api.core import data_loaders, shot_poller
from toktagger.api.crud import utils
from toktagger.api.schemas.projects import AutoAddShots, Project, ProjectIn
from toktagger.api.schemas.samples import SampleIn, ShotData

AUTO_ADD = AutoAddShots(enabled=True, interval_minutes=10)


@pytest.fixture
def latest_shot(monkeypatch):
    """Patch the UDA loader so latest_shot returns the value in the list."""
    value = [100]
    monkeypatch.setattr(
        data_loaders.UDADataLoader, "latest_shot", classmethod(lambda cls: value[0])
    )
    return value


async def _add_project(db_client, shot_ids: list[int], auto_add=AUTO_ADD) -> str:
    project = PROJECT_1.model_copy(update={"auto_add_shots": auto_add})
    project_id = await db_client.insert("projects", project)
    if shot_ids:
        await db_client.insert_many(
            "samples",
            [
                SampleIn(
                    shot_id=shot_id, data=ShotData(protocol="uda", signal_names=["ip"])
                )
                for shot_id in shot_ids
            ],
            ids={"project_id": ObjectId(project_id)},
        )
    return project_id


async def _shot_ids(db_client, project_id: str) -> list[int]:
    samples = await utils.get_samples(
        db_client, project_id, sort_by="shot_id", sort_direction="ascending"
    )
    return [sample.shot_id for sample in samples]


def test_auto_add_rejected_for_unsupported_loader():
    with pytest.raises(ValueError, match="does not support"):
        ProjectIn.model_validate(
            {**PROJECT_2.model_dump(), "auto_add_shots": AUTO_ADD.model_dump()}
        )


@pytest.mark.parametrize("loader", ["uda", "uda_camera", "sal"])
def test_shot_loaders_support_latest_shot(loader):
    assert data_loaders.LoaderRegistry.supports_latest_shot(loader)


def test_default_latest_shot_raises():
    assert not data_loaders.LoaderRegistry.supports_latest_shot("tabular")
    with pytest.raises(NotImplementedError):
        data_loaders.LoaderRegistry.get("tabular").latest_shot()


@pytest.mark.asyncio
async def test_get_max_shot_id(db_client):
    project_id = await _add_project(db_client, [5, 50, 7])
    assert await utils.get_max_shot_id(db_client, project_id) == 50

    empty_project_id = await _add_project(db_client, [])
    assert await utils.get_max_shot_id(db_client, empty_project_id) is None


@pytest.mark.asyncio
async def test_get_auto_add_shots_projects(db_client):
    enabled_id = await _add_project(db_client, [])
    await _add_project(
        db_client, [], auto_add=AUTO_ADD.model_copy(update={"enabled": False})
    )
    await _add_project(db_client, [], auto_add=None)

    projects = await utils.get_auto_add_shots_projects(db_client)
    assert [project.id for project in projects] == [enabled_id]


@pytest.mark.asyncio
async def test_add_new_shots_above_max(db_client):
    project_id = await _add_project(db_client, [10, 12])
    project = await utils.get_project(db_client, project_id)

    added = await utils.add_new_shots(db_client, project, latest_shot=15, max_shots=100)

    assert added == [13, 14, 15]
    assert await _shot_ids(db_client, project_id) == [10, 12, 13, 14, 15]
    samples = await utils.get_samples(db_client, project_id, shot_id=15)
    assert samples[0].data == ShotData(protocol="uda", signal_names=["Ip"])


@pytest.mark.asyncio
async def test_add_new_shots_capped(db_client):
    project_id = await _add_project(db_client, [10])
    project = await utils.get_project(db_client, project_id)

    added = await utils.add_new_shots(db_client, project, latest_shot=1000, max_shots=3)

    assert added == [11, 12, 13]


@pytest.mark.asyncio
async def test_add_new_shots_empty_project_adds_latest_only(db_client):
    project_id = await _add_project(db_client, [])
    project = await utils.get_project(db_client, project_id)

    assert await utils.add_new_shots(
        db_client, project, latest_shot=500, max_shots=100
    ) == [500]
    assert (
        await utils.add_new_shots(db_client, project, latest_shot=500, max_shots=100)
        == []
    )
    assert await _shot_ids(db_client, project_id) == [500]


@pytest.mark.asyncio
async def test_add_new_shots_latest_below_max(db_client):
    project_id = await _add_project(db_client, [10])
    project = await utils.get_project(db_client, project_id)

    assert (
        await utils.add_new_shots(db_client, project, latest_shot=5, max_shots=100)
        == []
    )


def test_is_due():
    now = datetime(2026, 1, 1, 12, 0)
    project = PROJECT_1.model_copy(update={"auto_add_shots": AUTO_ADD})
    project = Project(**project.model_dump(), _id="test")
    assert shot_poller.is_due(project, now)

    project.shots_last_checked = now - timedelta(minutes=9)
    assert not shot_poller.is_due(project, now)

    project.shots_last_checked = now - timedelta(minutes=10)
    assert shot_poller.is_due(project, now)

    project.auto_add_shots = AUTO_ADD.model_copy(update={"enabled": False})
    assert not shot_poller.is_due(project, now)


@pytest.mark.asyncio
async def test_poll_once_adds_shots_and_waits_for_interval(db_client, latest_shot):
    project_id = await _add_project(db_client, [98])

    await shot_poller.poll_once(db_client)
    assert await _shot_ids(db_client, project_id) == [98, 99, 100]
    project = await utils.get_project(db_client, project_id)
    assert project.shots_last_checked is not None

    latest_shot[0] = 105
    await shot_poller.poll_once(db_client)
    assert await _shot_ids(db_client, project_id) == [98, 99, 100]


@pytest.mark.asyncio
async def test_poll_once_uses_max_shots_setting(db_client, latest_shot, monkeypatch):
    monkeypatch.setattr(config.settings.polling, "max_shots_per_check", 1)
    project_id = await _add_project(db_client, [90])

    await shot_poller.poll_once(db_client)

    assert await _shot_ids(db_client, project_id) == [90, 91]


@pytest.mark.asyncio
async def test_poll_once_continues_after_loader_error(db_client, monkeypatch):
    def fail(cls):
        raise data_loaders.DataLoaderError("UDA is down")

    sal_project = PROJECT_1.model_copy(
        update={"data_loader": "sal", "auto_add_shots": AUTO_ADD}
    )
    sal_project_id = await db_client.insert("projects", sal_project)
    uda_project_id = await _add_project(db_client, [9])
    monkeypatch.setattr(data_loaders.SALDataLoader, "latest_shot", classmethod(fail))
    monkeypatch.setattr(
        data_loaders.UDADataLoader, "latest_shot", classmethod(lambda cls: 10)
    )

    await shot_poller.poll_once(db_client)

    assert await _shot_ids(db_client, uda_project_id) == [9, 10]
    failed_project = await utils.get_project(db_client, sal_project_id)
    assert failed_project.shots_last_checked is not None


@pytest.mark.asyncio
async def test_check_project_skips_when_locked(db_client, latest_shot):
    project_id = await _add_project(db_client, [98])

    async with db_client.lock(f"shot-poll:{project_id}"):
        assert await shot_poller.check_project(db_client, project_id) == []

    assert await _shot_ids(db_client, project_id) == [98]
