"""Single-process lifecycle and cursor behaviour of AsyncMongitaClient."""

import asyncio
import contextlib
import gc
import threading
import time
import warnings
from pathlib import Path

import pytest
import pytest_asyncio
from filelock import FileLock
from mongita import MongitaClientDisk
from mongita.errors import DuplicateKeyError

from toktagger.api.crud.mongita_client import AsyncMongitaClient


@pytest_asyncio.fixture
async def client(tmp_path):
    mongita_client = AsyncMongitaClient(str(tmp_path / "toktagger_db"))
    yield mongita_client
    await mongita_client.close()


@pytest.mark.asyncio
async def test_operations_after_close_raise(tmp_path):
    mongita_client = AsyncMongitaClient(str(tmp_path / "toktagger_db"))
    await mongita_client.close()

    with pytest.raises(RuntimeError, match="closed"):
        await mongita_client["annotate_db"]["projects"].count_documents({})


@pytest.mark.asyncio
async def test_cancelled_operation_does_not_overlap_the_next(client):
    """A cancelled caller must not let a second operation start beside the first."""
    started = threading.Event()
    release = threading.Event()
    thread_ids: list[int] = []
    running = 0
    max_running = 0

    def _op(block: bool):
        nonlocal running, max_running
        running += 1
        max_running = max(max_running, running)
        thread_ids.append(threading.get_ident())
        if block:
            started.set()
            release.wait(timeout=10)
        running -= 1

    slow = asyncio.create_task(
        client._run(lambda mongita_client: _op(True), mutates=True)
    )
    await asyncio.to_thread(started.wait, 10)
    slow.cancel()
    with pytest.raises(asyncio.CancelledError):
        await slow

    fast = asyncio.create_task(client._run(lambda mongita_client: _op(False)))
    await asyncio.sleep(0.1)
    assert not fast.done()

    release.set()
    await fast
    assert max_running == 1
    assert len(set(thread_ids)) == 1


def _version(tmp_path: Path) -> int:
    return int(Path(str(tmp_path / "toktagger_db") + ".version").read_text())


@pytest.mark.asyncio
async def test_failed_write_bumps_version_and_drops_own_cache(client, tmp_path):
    collection = client["annotate_db"]["projects"]
    await collection.insert_one({"name": "seed"})
    before = _version(tmp_path)

    def _partial_write(mongita_client: MongitaClientDisk):
        mongita_client["annotate_db"]["projects"].insert_one({"name": "partial"})
        raise ValueError("boom")

    with pytest.raises(ValueError):
        await client._run(_partial_write, mutates=True)

    assert _version(tmp_path) == before + 1
    assert client._seen_version is None
    assert await collection.count_documents({}) == 2


@pytest.mark.asyncio
async def test_duplicate_insert_does_not_bump_version(client, tmp_path):
    collection = client["annotate_db"]["locks"]
    await collection.insert_one({"_id": "lock"})
    before = _version(tmp_path)

    with pytest.raises(DuplicateKeyError):
        await collection.insert_one({"_id": "lock"})

    assert _version(tmp_path) == before
    assert client._seen_version == before


@pytest.mark.asyncio
async def test_writes_that_match_nothing_do_not_bump_version(client, tmp_path):
    collection = client["annotate_db"]["locks"]
    await collection.insert_one({"_id": "lock", "expires_at": 10})
    before = _version(tmp_path)

    await collection.update_one({"expires_at": {"$lt": 0}}, {"$set": {"owner": "x"}})
    await collection.update_many({"_id": "missing"}, {"$set": {"owner": "x"}})
    await collection.delete_one({"_id": "missing"})
    await collection.delete_many({"_id": "missing"})
    assert _version(tmp_path) == before

    await collection.delete_one({"_id": "lock"})
    assert _version(tmp_path) == before + 1


@pytest.mark.asyncio
async def test_write_that_creates_collection_bumps_version(client, tmp_path):
    await client["annotate_db"]["projects"].insert_one({"name": "seed"})
    before = _version(tmp_path)

    await client["annotate_db"]["locks"].delete_one({"_id": "missing"})

    assert _version(tmp_path) == before + 1


@pytest.mark.asyncio
async def test_failed_version_write_removes_counter(client, tmp_path, monkeypatch):
    collection = client["annotate_db"]["projects"]
    await collection.insert_one({"name": "seed"})

    def _fail(*args, **kwargs):
        raise OSError("disk full")

    monkeypatch.setattr("toktagger.api.crud.mongita_client.os.replace", _fail)
    await collection.insert_one({"name": "second"})

    assert not Path(str(tmp_path / "toktagger_db") + ".version").exists()
    assert client._seen_version is None

    monkeypatch.undo()
    await collection.insert_one({"name": "third"})
    assert _version(tmp_path) > time.time_ns() - 60 * 10**9


def _dirty_path(tmp_path: Path) -> Path:
    return Path(str(tmp_path / "toktagger_db") + ".dirty")


@pytest.mark.asyncio
async def test_interrupted_write_is_recovered(client, tmp_path):
    collection = client["annotate_db"]["projects"]
    await collection.insert_one({"name": "seed"})
    before = _version(tmp_path)

    _dirty_path(tmp_path).touch()
    assert await collection.find_one({"name": "seed"}) is not None

    assert _version(tmp_path) == before + 1
    assert client._seen_version == before + 1
    assert not _dirty_path(tmp_path).exists()


@pytest.mark.asyncio
async def test_writes_clear_dirty_marker(client, tmp_path):
    collection = client["annotate_db"]["locks"]

    await collection.insert_one({"_id": "lock"})
    assert not _dirty_path(tmp_path).exists()

    with pytest.raises(DuplicateKeyError):
        await collection.insert_one({"_id": "lock"})
    assert not _dirty_path(tmp_path).exists()

    await collection.update_one({"_id": "missing"}, {"$set": {"owner": "x"}})
    assert not _dirty_path(tmp_path).exists()


@pytest.mark.asyncio
async def test_failing_change_check_bumps_version(client, tmp_path):
    await client["annotate_db"]["projects"].insert_one({"name": "seed"})
    before = _version(tmp_path)

    def _broken_check(result: object) -> bool:
        raise ZeroDivisionError

    with pytest.raises(ZeroDivisionError):
        await client._run(lambda mongita_client: None, mutates=_broken_check)

    assert _version(tmp_path) == before + 1
    assert client._seen_version is None
    assert not _dirty_path(tmp_path).exists()


@pytest.mark.asyncio
async def test_cancelled_close_still_shuts_down(tmp_path):
    mongita_client = AsyncMongitaClient(str(tmp_path / "toktagger_db"))
    await mongita_client["annotate_db"]["projects"].insert_one({"name": "seed"})

    closing = asyncio.create_task(mongita_client.close())
    await asyncio.sleep(0)
    closing.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await closing

    with pytest.raises(RuntimeError):
        mongita_client._executor.submit(lambda: None)


def test_constructor_does_not_take_file_lock(tmp_path):
    store = str(tmp_path / "toktagger_db")
    constructed = threading.Event()

    def _construct() -> None:
        AsyncMongitaClient(store)
        constructed.set()

    with FileLock(store + ".lock"):
        threading.Thread(target=_construct, daemon=True).start()
        assert constructed.wait(timeout=5)


@pytest.mark.asyncio
async def test_cursor_is_consumed_once(client):
    collection = client["annotate_db"]["projects"]
    await collection.insert_many([{"n": index} for index in range(3)])

    cursor = collection.find({}, sort=[("n", 1)])
    assert [doc["n"] async for doc in cursor] == [0, 1, 2]
    assert [doc["n"] async for doc in cursor] == []


@pytest.mark.asyncio
async def test_to_list_continues_from_cursor_position(client):
    collection = client["annotate_db"]["projects"]
    await collection.insert_many([{"n": index} for index in range(4)])

    cursor = collection.find({}, sort=[("n", 1)])
    assert (await cursor.__anext__())["n"] == 0
    assert [doc["n"] for doc in await cursor.to_list(2)] == [1, 2]
    assert [doc["n"] for doc in await cursor.to_list()] == [3]
    assert await cursor.to_list() == []


@pytest.mark.asyncio
async def test_unused_cursor_does_not_warn(client):
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        client["annotate_db"]["projects"].find({})
        gc.collect()
    assert not [warning for warning in caught if warning.category is RuntimeWarning]
