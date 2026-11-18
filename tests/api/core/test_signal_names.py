import pytest
from bson import ObjectId

from toktagger.api.core.data_loaders import LoaderRegistry
from toktagger.api.crud import utils
from toktagger.api.schemas.projects import Task

from tests import db_definitions


@pytest.mark.parametrize(
    ("loader", "signal_names"),
    [
        ("uda", ["ip", "dalpha"]),
        ("uda_camera", ["rba"]),
        ("sal", ["ppf/signal/jetppf/magn/ipla"]),
        ("fair_mast", ["magnetics/ip"]),
        ("tabular", []),
        ("tabular", ["ip", "dalpha"]),
        ("image-array", []),
        ("image-array", ["frames"]),
        ("image", []),
    ],
)
def test_check_signal_names_valid(loader, signal_names):
    LoaderRegistry.check_signal_names(loader, signal_names)


@pytest.mark.parametrize(
    ("loader", "signal_names", "message"),
    [
        ("uda", [], "at least 1"),
        ("sal", [], "at least 1"),
        ("uda_camera", ["rba", "rbb"], "at most 1"),
        ("image-array", ["a", "b"], "at most 1"),
        ("image", ["a"], "does not use signal names"),
    ],
)
def test_check_signal_names_invalid(loader, signal_names, message):
    with pytest.raises(ValueError, match=message):
        LoaderRegistry.check_signal_names(loader, signal_names)


@pytest.mark.parametrize(
    ("loader", "signal_names", "expected"),
    [
        ("uda", ["ip"], {"signal_names": ["ip"]}),
        ("tabular", ["ip"], {"signal_names": ["ip"]}),
        ("tabular", [], {"signal_names": None}),
        ("image-array", ["frames"], {"signal_name": "frames"}),
        ("image-array", [], {"signal_name": None}),
        ("image", [], {}),
    ],
)
def test_signal_name_fields(loader, signal_names, expected):
    assert LoaderRegistry.signal_name_fields(loader, signal_names) == expected


@pytest.mark.asyncio
async def test_get_signal_name_rules(api_client):
    response = await api_client.get("/meta/dataloader/uda_camera/signal-names")
    assert response.status_code == 200
    assert response.json() == {"min": 1, "max": 1}

    response = await api_client.get("/meta/dataloader/tabular/signal-names")
    assert response.json() == {"min": 0, "max": None}


@pytest.mark.asyncio
async def test_create_project_without_required_signal_names(api_client):
    response = await api_client.post(
        "/projects",
        json={
            "name": "no_signals",
            "task": Task.TIME_SERIES,
            "query_strategy": "random",
            "data_loader": "uda",
        },
    )
    assert response.status_code == 422
    assert "at least 1" in response.json()["detail"]


@pytest.mark.asyncio
async def test_create_project_with_too_many_signal_names(api_client):
    response = await api_client.post(
        "/projects",
        json={
            "name": "two_cameras",
            "task": Task.VIDEO,
            "query_strategy": "random",
            "data_loader": "uda_camera",
            "signal_names": ["rba", "rbb"],
        },
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_add_samples_uses_project_signal_names(api_client, setup_db):
    project_id = setup_db["project_id_1"]
    response = await api_client.post(
        f"/projects/{project_id}/samples",
        json=[
            {"shot_id": 100, "data": {"protocol": "uda"}},
            {"shot_id": 101, "data": {"protocol": "uda", "signal_names": ["other"]}},
        ],
    )
    assert response.status_code == 200, response.text

    samples = await api_client.get(f"/projects/{project_id}/samples")
    added = [
        sample["data"]["signal_names"]
        for sample in samples.json()
        if sample["shot_id"] in (100, 101)
    ]
    assert added == [["Ip"], ["Ip"]]


@pytest.mark.asyncio
async def test_add_samples_rejected_without_project_signal_names(api_client, db_client):
    project = db_definitions.PROJECT_1.model_copy(update={"signal_names": []})
    project_id = await db_client.insert("projects", project)

    response = await api_client.post(
        f"/projects/{project_id}/samples",
        json=[{"shot_id": 1, "data": {"protocol": "uda"}}],
    )
    assert response.status_code == 422
    assert "project settings" in response.json()["detail"]


@pytest.mark.asyncio
async def test_update_signal_names_updates_all_samples(api_client, setup_db):
    project_id = setup_db["project_id_1"]
    response = await api_client.put(
        f"/projects/{project_id}", json={"signal_names": ["ip", "dalpha"]}
    )
    assert response.status_code == 200

    project = await api_client.get(f"/projects/{project_id}")
    assert project.json()["signal_names"] == ["ip", "dalpha"]
    samples = await api_client.get(f"/projects/{project_id}/samples")
    assert samples.json()
    assert all(
        sample["data"]["signal_names"] == ["ip", "dalpha"] for sample in samples.json()
    )


@pytest.mark.asyncio
async def test_update_signal_names_rejects_invalid_count(api_client, setup_db):
    response = await api_client.put(
        f"/projects/{setup_db['project_id_1']}", json={"signal_names": []}
    )
    assert response.status_code == 422

    project = await api_client.get(f"/projects/{setup_db['project_id_1']}")
    assert project.json()["signal_names"] == ["Ip"]


@pytest.mark.asyncio
async def test_backfill_project_signal_names(db_client):
    legacy_projects = [
        project.model_dump(exclude={"signal_names"})
        for project in (db_definitions.PROJECT_1, db_definitions.PROJECT_2)
    ]
    result = await db_client.db["projects"].insert_many(legacy_projects)
    with_samples, without_samples = (
        str(object_id) for object_id in result.inserted_ids
    )
    already_set = await db_client.insert(
        "projects",
        db_definitions.PROJECT_2.model_copy(update={"signal_names": ["kept"]}),
    )
    await db_client.insert(
        "samples",
        db_definitions.SAMPLE_1.model_copy(
            update={
                "data": db_definitions.SAMPLE_1.data.model_copy(
                    update={"signal_names": ["from_sample"]}
                )
            }
        ),
        ids={"project_id": ObjectId(with_samples)},
    )

    await utils.backfill_project_signal_names(db_client)

    assert (await utils.get_project(db_client, with_samples)).signal_names == [
        "from_sample"
    ]
    assert (await utils.get_project(db_client, without_samples)).signal_names == []
    assert (await utils.get_project(db_client, already_set)).signal_names == ["kept"]
