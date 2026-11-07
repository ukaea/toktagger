import asyncio
import logging
import os
import re
import time
from collections.abc import AsyncIterator, Awaitable, Callable, Iterable
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from filelock import FileLock
from mongita import MongitaClientDisk
from mongita.collection import Collection
from mongita.errors import DuplicateKeyError
from mongita.results import DeleteResult, UpdateResult

logger = logging.getLogger(__name__)


class AsyncMongitaClient:
    """Async, multi-process-safe wrapper around the embedded Mongita store.

    Mongita is a single-process database. `DiskEngine` loads a collection's document
    index (`$.file_attrs`) the first time it is asked for and then never re-reads it,
    and `put_metadata` writes that in-memory index straight back over the file. Two
    workers sharing a store therefore diverge immediately, and the divergence is not
    merely stale reads: whichever worker writes next replaces the other's index
    entries, leaving their documents in `$.data` but unreachable -- silent data loss.

    To make several uvicorn workers safe, this class keeps a version counter beside
    the store. Every operation runs inside the cross-process FileLock, and reads the
    counter first: if another worker has written since our last operation, all cached
    state is dropped and re-read from disk. Writes bump the counter. Read-only
    workloads leave the counter untouched, so caches stay warm. A marker file is
    held for the length of each write, so a worker killed mid-write is detected by
    the next one, which bumps the counter on its behalf.

    Inside one worker, every operation runs on a single dedicated thread, so Mongita
    objects are only ever touched from that thread and at most one operation is in
    flight, whatever happens to the coroutines awaiting them.

    Note that the FileLock serialises every database operation across all workers, so
    extra workers add no database concurrency -- only parallelism for the work either
    side of it (data loading, response building). Use a real MongoDB if you need
    concurrent database throughput.
    """

    def __init__(
        self,
        db_path: str,
    ) -> None:
        path = Path(db_path)
        path.mkdir(parents=True, exist_ok=True)
        self._path = str(path)
        self._file_lock = FileLock(self._path + ".lock")
        # Built lazily on the worker thread, so the constructor never waits on the lock.
        self._client: MongitaClientDisk | None = None
        self._closed = False
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="mongita")
        # Kept beside the store rather than inside it, like the lock file, so that
        # dropping a database cannot delete the counter along with the data.
        self._version_path = Path(self._path + ".version")
        self._dirty_path = Path(self._path + ".dirty")
        # The store version our caches correspond to. None forces a refresh on the
        # first operation, which is free because nothing is cached yet.
        self._seen_version: int | None = None

    def __getitem__(self, name: str) -> "AsyncDatabase":
        return AsyncDatabase(self, name)

    def _read_version(self) -> int | None:
        """Return the store's current version, or None if it could not be read.

        None is treated as "somebody else may have written", which fails in the safe
        direction: caches are dropped and the store is re-read.
        """
        try:
            return int(self._version_path.read_text())
        except (OSError, ValueError):
            return None

    def _mongita(self) -> MongitaClientDisk:
        """Return the Mongita client, creating it on first use. Call under the lock."""
        if self._client is None:
            self._client = MongitaClientDisk(self._path)
        return self._client

    def _refresh_if_stale(self, mongita_client: MongitaClientDisk) -> None:
        """Drop cached state if another process has written since our last operation.

        `engine.close()` clears the document cache, collection metadata, the document
        index and the open file handles. The engine object itself is reused rather
        than replaced, so the Database and Collection objects that hold a reference
        to it stay valid, and the handles are reopened lazily on next use.

        A leftover write marker means a worker died mid-write without bumping the
        counter, so the bump is done here before anyone serves from a stale cache.
        """
        if self._dirty_path.exists():
            logger.warning(
                "Found %s; a worker stopped during a write, invalidating all caches",
                self._dirty_path,
            )
            mongita_client.engine.close()
            self._bump_version()
            self._dirty_path.unlink(missing_ok=True)
            return
        version = self._read_version()
        if version is None or version != self._seen_version:
            mongita_client.engine.close()
            self._seen_version = version

    def _bump_version(self) -> None:
        """Record that this worker has written, invalidating every other worker."""
        # Seeded from the clock so a recreated counter cannot repeat a value already seen.
        next_version = (self._read_version() or time.time_ns()) + 1
        # Written via a temporary file so a crash mid-write cannot leave a truncated
        # counter. A missing or unreadable counter only costs an extra refresh.
        tmp_path = Path(str(self._version_path) + ".tmp")
        try:
            tmp_path.write_text(str(next_version))
            os.replace(tmp_path, self._version_path)
        except OSError:
            # A stale counter lets other workers overwrite this write; none forces a re-read.
            self._seen_version = None
            logger.warning(
                "Could not update %s; removing it so all workers re-read the store",
                self._version_path,
                exc_info=True,
            )
            self._version_path.unlink(missing_ok=True)
            return
        self._seen_version = next_version

    async def _run(
        self,
        fn: Callable[[MongitaClientDisk], Any],
        *,
        mutates: bool | Callable[[Any], bool] = False,
        clean_errors: tuple[type[BaseException], ...] = (),
    ) -> Any:
        """Run fn on the worker thread with the Mongita client, holding the FileLock.

        The single worker thread serialises operations in this worker; FileLock
        serialises them across uvicorn workers. If the awaiting coroutine is
        cancelled, an operation that has not started is dropped and one that has
        started still completes.

        Each wrapped operation is serialised: the staleness check, fn and the version
        bump all happen under one lock. Two separate calls (e.g. find_one then
        update_one) are not atomic, so another worker can act between them. Callers
        that change the store must pass mutates=True, otherwise other workers will
        keep serving from caches this write has invalidated. mutates may instead be
        a predicate on fn's result that says whether anything was written, so that
        no-op writes leave other workers' caches warm.

        A mutating fn that raises, or whose predicate raises, still bumps the version,
        since it may have partly written, and this worker drops its own caches too.
        Exceptions in clean_errors are known to be raised before anything is written,
        so they skip both. A mutating fn holds the write marker until the bump is done.
        """
        if self._closed:
            raise RuntimeError("Database client is closed")

        def _in_thread():
            with self._file_lock:
                mongita_client = self._mongita()
                self._refresh_if_stale(mongita_client)
                if mutates:
                    self._dirty_path.touch()
                try:
                    result = fn(mongita_client)
                    changed = mutates if isinstance(mutates, bool) else mutates(result)
                except clean_errors:
                    self._dirty_path.unlink(missing_ok=True)
                    raise
                except BaseException:
                    if mutates:
                        self._bump_version()
                    self._seen_version = None
                    self._dirty_path.unlink(missing_ok=True)
                    raise
                if changed:
                    self._bump_version()
                if mutates:
                    self._dirty_path.unlink(missing_ok=True)
                return result

        return await asyncio.get_running_loop().run_in_executor(
            self._executor, _in_thread
        )

    async def close(self) -> None:
        """Close the store once all queued operations have finished."""
        if self._closed:
            return
        self._closed = True

        def _close():
            if self._client is None:
                return
            with self._file_lock:
                self._client.close()

        try:
            await asyncio.get_running_loop().run_in_executor(self._executor, _close)
        finally:
            # Queued work, including _close, still runs if this await was cancelled.
            self._executor.shutdown(wait=False)


class AsyncDatabase:
    def __init__(self, client: AsyncMongitaClient, name: str) -> None:
        self._client = client
        self._name = name

    def __getitem__(self, name: str) -> "AsyncCollection":
        return AsyncCollection(self, name)

    @property
    def name(self) -> str:
        return self._name


class AsyncCollection:
    def __init__(self, database: AsyncDatabase, name: str) -> None:
        self._database = database
        self._name = name

    @property
    def name(self) -> str:
        return self._name

    async def _run(
        self,
        op: Callable[[Collection], Any],
        *,
        mutates: bool = False,
        wrote: Callable[[Any], bool] | None = None,
        clean_errors: tuple[type[BaseException], ...] = (),
    ) -> Any:
        """Resolve the Mongita collection on the worker thread and apply op to it.

        wrote, if given, says from op's result whether the store changed. Mongita
        creates a missing collection even when the op itself matches nothing, so a
        call that creates the collection always counts as a write.
        """
        client = self._database._client

        def _apply(mongita_client: MongitaClientDisk) -> tuple[Any, bool]:
            database = mongita_client[self._database.name]
            created = self._name not in database.list_collection_names()
            return op(database[self._name]), created

        def _changed(outcome: tuple[Any, bool]) -> bool:
            result, created = outcome
            return created or wrote is None or wrote(result)

        result, _ = await client._run(
            _apply, mutates=_changed if mutates else False, clean_errors=clean_errors
        )
        return result

    async def insert_one(self, document: dict[str, Any]) -> Any:
        # Mongita rejects a duplicate _id before it writes anything.
        return await self._run(
            lambda col: col.insert_one(document),
            mutates=True,
            clean_errors=(DuplicateKeyError,),
        )

    async def insert_many(self, documents: Iterable[dict[str, Any]]) -> Any:
        docs = list(documents)
        return await self._run(lambda col: col.insert_many(docs), mutates=True)

    async def find_one(
        self, filter: dict[str, Any] | None = None, *args, **kwargs
    ) -> dict[str, Any] | None:
        f = filter or {}
        return await self._run(lambda col: col.find_one(f, *args, **kwargs))

    def find(
        self,
        filter: dict[str, Any] | None = None,
        *args,
        skip: int = 0,
        limit: int | None = None,
        sort: list[tuple[str, int]] | None = None,
        **kwargs,
    ) -> "AsyncCursor":
        async def _snapshot() -> list[dict[str, Any]]:
            mongo_filter = {}
            regex_filters = []

            # Separate regex conditions from normal filters
            if filter:
                for field, condition in filter.items():
                    if isinstance(condition, dict) and "$regex" in condition:
                        pattern = condition["$regex"]
                        flags = condition.get("$options", 0)
                        if flags == "i":
                            flags = re.IGNORECASE
                        regex_filters.append((field, re.compile(pattern, flags)))
                    else:
                        mongo_filter[field] = condition

            results = await self._run(
                lambda col: list(col.find(mongo_filter or {}, *args, **kwargs))
            )

            # Apply regex filters
            if regex_filters:
                filtered = []
                for doc in results:
                    match = True
                    for field, regex in regex_filters:
                        value = str(doc.get(field, ""))
                        if not regex.search(value):
                            match = False
                            break
                    if match:
                        filtered.append(doc)
                results = filtered

            if sort:
                for key, direction in reversed(sort):
                    results.sort(key=lambda x: x.get(key), reverse=(direction < 0))
            if skip:
                results = results[skip:]
            if limit is not None and limit > 0:
                results = results[:limit]
            return results

        return AsyncCursor(_snapshot)

    async def update_one(
        self, filter: dict[str, Any], update: dict[str, Any], *args, **kwargs
    ) -> Any:
        return await self._run(
            lambda col: col.update_one(filter, update, *args, **kwargs),
            mutates=True,
            wrote=_modified,
        )

    async def update_many(
        self, filter: dict[str, Any], update: dict[str, Any], *args, **kwargs
    ) -> Any:
        return await self._run(
            lambda col: col.update_many(filter, update, *args, **kwargs),
            mutates=True,
            wrote=_modified,
        )

    async def delete_one(self, filter: dict[str, Any], *args, **kwargs) -> Any:
        return await self._run(
            lambda col: col.delete_one(filter, *args, **kwargs),
            mutates=True,
            wrote=_deleted,
        )

    async def delete_many(self, filter: dict[str, Any], *args, **kwargs) -> Any:
        return await self._run(
            lambda col: col.delete_many(filter, *args, **kwargs),
            mutates=True,
            wrote=_deleted,
        )

    async def count_documents(
        self, filter: dict[str, Any] | None = None, *args, **kwargs
    ) -> int:
        f = filter or {}
        return await self._run(lambda col: col.count_documents(f, *args, **kwargs))

    async def create_index(self, keys: Any, *args, **kwargs) -> Any:
        return await self._run(
            lambda col: col.create_index(keys, *args, **kwargs), mutates=True
        )


def _modified(result: UpdateResult) -> bool:
    return result.modified_count > 0 or result.upserted_id is not None


def _deleted(result: DeleteResult) -> bool:
    return result.deleted_count > 0


class AsyncCursor:
    """A cursor over a snapshot loaded on first use and consumed once, like pymongo's."""

    def __init__(self, loader: Callable[[], Awaitable[list[dict[str, Any]]]]):
        self._loader = loader
        self._docs: list[dict[str, Any]] | None = None
        self._idx = 0

    async def _load(self) -> list[dict[str, Any]]:
        if self._docs is None:
            self._docs = await self._loader()
        return self._docs

    def __aiter__(self) -> AsyncIterator[dict[str, Any]]:
        return self

    async def __anext__(self) -> dict[str, Any]:
        docs = await self._load()
        if self._idx >= len(docs):
            raise StopAsyncIteration
        doc = docs[self._idx]
        self._idx += 1
        return doc

    async def to_list(self, length: int | None = None) -> list[dict[str, Any]]:
        docs = await self._load()
        end = len(docs) if length is None else min(self._idx + length, len(docs))
        remaining = docs[self._idx : end]
        self._idx = end
        return remaining
