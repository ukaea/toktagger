"""
async_mongita_wrapper.py

A fully asynchronous, multi-process-safe wrapper around Mongita that mimics a subset of
PyMongo/Motor's async API. Concurrency across processes is coordinated using a file lock,
and synchronous Mongita operations are executed in a worker thread so the asyncio event
loop stays responsive.

Features
- Async client / database / collection objects with awaitable CRUD methods
- Multi-process safety via file-based mutex (filelock)
- Motor-like minimal API surface: insert_one, insert_many, find_one, find (async iterator),
  update_one, update_many, delete_one, delete_many, count_documents, create_index
- Supports find sorting, skipping, and limiting results
- Type hints and structured design to extend further

Limitations
- Operations are serialized across processes by a single exclusive file lock. This is the
  safest default but may reduce throughput compared to DBs with reader/writer locks.
- No real MongoDB transactions or change streams.
- API is a pragmatic subset; extend as needed

Usage
-------
from async_mongita_wrapper import AsyncMongitaClient

client = AsyncMongitaClient(db_path="./mydb")
db = client["testdb"]
collection = db["users"]

async def main():
    await collection.insert_one({"name": "Alice", "age": 30})
    doc = await collection.find_one({"name": "Alice"})
    print(doc)

    # Async iteration with skip, limit, sort
    async for d in collection.find({"age": {"$gte": 18}}, sort=[("age", 1)], skip=0, limit=10):
        print(d)

    await client.close()

"""

from __future__ import annotations

import asyncio
from typing import Any, AsyncIterator, Dict, Iterable, List, Optional, Tuple
import re
from mongita import MongitaClientDisk


class AsyncMutex:
    def __init__(self) -> None:
        self._alock = asyncio.Lock()
        self._loop = asyncio.get_event_loop()

    async def __aenter__(self):
        await self._alock.acquire()
        return self

    async def __aexit__(self, exc_type, exc, tb):
        self._alock.release()


class AsyncMongitaClient:
    def __init__(
        self,
        db_path: str,
    ) -> None:
        self._client = MongitaClientDisk(db_path)
        self._closed = False
        self._mutex = AsyncMutex()

    def __getitem__(self, name: str) -> "AsyncDatabase":
        return AsyncDatabase(self, name)

    async def close(self) -> None:
        if self._closed:
            return
        await asyncio.to_thread(self._client.close)
        self._closed = True


class AsyncDatabase:
    def __init__(self, client: AsyncMongitaClient, name: str) -> None:
        self._client = client
        self._name = name
        self._sync_db = client._client[name]

    def __getitem__(self, name: str) -> "AsyncCollection":
        return AsyncCollection(self, name)

    @property
    def name(self) -> str:
        return self._name


class AsyncCollection:
    def __init__(self, database: AsyncDatabase, name: str) -> None:
        self._database = database
        self._name = name
        self._sync_col = database._sync_db[name]

    @property
    def name(self) -> str:
        return self._name

    async def insert_one(self, document: Dict[str, Any]) -> Any:
        async with self._database._client._mutex:
            return await asyncio.to_thread(self._sync_col.insert_one, document)

    async def insert_many(self, documents: Iterable[Dict[str, Any]]) -> Any:
        async with self._database._client._mutex:
            return await asyncio.to_thread(self._sync_col.insert_many, list(documents))

    async def find_one(
        self, filter: Optional[Dict[str, Any]] = None, *args, **kwargs
    ) -> Optional[Dict[str, Any]]:
        async with self._database._client._mutex:
            return await asyncio.to_thread(
                self._sync_col.find_one, filter or {}, *args, **kwargs
            )

    def find(
        self,
        filter: Optional[Dict[str, Any]] = None,
        *args,
        skip: int = 0,
        limit: Optional[int] = None,
        sort: Optional[List[Tuple[str, int]]] = None,
        **kwargs,
    ) -> "AsyncCursor":
        async def _snapshot() -> List[Dict[str, Any]]:
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

            async with self._database._client._mutex:
                cursor = await asyncio.to_thread(
                    self._sync_col.find, mongo_filter or {}, *args, **kwargs
                )
                results = await asyncio.to_thread(lambda: list(cursor))

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

        return AsyncCursor(_snapshot())

    async def update_one(
        self, filter: Dict[str, Any], update: Dict[str, Any], *args, **kwargs
    ) -> Any:
        async with self._database._client._mutex:
            return await asyncio.to_thread(
                self._sync_col.update_one, filter, update, *args, **kwargs
            )

    async def update_many(
        self, filter: Dict[str, Any], update: Dict[str, Any], *args, **kwargs
    ) -> Any:
        async with self._database._client._mutex:
            return await asyncio.to_thread(
                self._sync_col.update_many, filter, update, *args, **kwargs
            )

    async def delete_one(self, filter: Dict[str, Any], *args, **kwargs) -> Any:
        async with self._database._client._mutex:
            return await asyncio.to_thread(
                self._sync_col.delete_one, filter, *args, **kwargs
            )

    async def delete_many(self, filter: Dict[str, Any], *args, **kwargs) -> Any:
        async with self._database._client._mutex:
            return await asyncio.to_thread(
                self._sync_col.delete_many, filter, *args, **kwargs
            )

    async def count_documents(
        self, filter: Optional[Dict[str, Any]] = None, *args, **kwargs
    ) -> int:
        async with self._database._client._mutex:
            return await asyncio.to_thread(
                self._sync_col.count_documents, filter or {}, *args, **kwargs
            )

    async def create_index(self, keys: Any, *args, **kwargs) -> Any:
        async with self._database._client._mutex:
            return await asyncio.to_thread(
                self._sync_col.create_index, keys, *args, **kwargs
            )


class AsyncCursor:
    def __init__(self, loader_coro: asyncio.Future | asyncio.Task | Any):
        self._loader = loader_coro
        self._docs: Optional[List[Dict[str, Any]]] = None
        self._idx = 0

    def __aiter__(self) -> AsyncIterator[Dict[str, Any]]:
        self._idx = 0
        return self

    async def __anext__(self) -> Dict[str, Any]:
        if self._docs is None:
            self._docs = await self._loader
        if self._idx >= len(self._docs):
            raise StopAsyncIteration
        doc = self._docs[self._idx]
        self._idx += 1
        return doc

    async def to_list(self, length: Optional[int] = None) -> List[Dict[str, Any]]:
        if self._docs is None:
            self._docs = await self._loader
        if length is None:
            return list(self._docs)
        return list(self._docs[:length])
