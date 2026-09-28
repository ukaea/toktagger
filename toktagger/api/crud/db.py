import asyncio
import random
import time
import typing
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import mongita.errors
import pydantic
import pymongo
import pymongo.errors
from pymongo.results import UpdateResult
from bson.objectid import ObjectId
from platformdirs import user_cache_dir

from toktagger.api.crud.mongita_client import AsyncMongitaClient

DATABASE_NAME = "event_db"
COLLECTION_NAME = "shots"

T = typing.TypeVar("T", bound=pydantic.BaseModel)


class LockTimeoutError(Exception):
    """Raised when a distributed lock cannot be acquired before the timeout."""


class MongoDBClient:
    def __init__(self, url: str, db_name: str, cache_dir: str | None = None):
        if url.startswith("mongodb://"):
            # Use mongodb (expects running instance of mongodb at this address)
            self.client = pymongo.AsyncMongoClient(url)
        else:
            # File-path mode (embedded Mongita): store data under cache_dir if given,
            # otherwise the platform-specific user cache directory.
            base_dir = (
                Path(cache_dir)
                if cache_dir
                else Path(user_cache_dir("toktagger", "ukaea"))
            )
            base_dir.mkdir(parents=True, exist_ok=True)
            self.client = AsyncMongitaClient(str(base_dir / db_name))
        self.db = self.client[db_name]

    async def insert(
        self,
        collection: typing.Literal[
            "projects", "annotations", "models", "samples", "users", "project_members"
        ],
        model: T,
        ids: dict[str, ObjectId] | None = None,
    ):
        ids = ids or {}
        document = model.model_dump(mode="python")
        document.update(ids)
        result = await self.db[collection].insert_one(document)
        return str(result.inserted_id)

    async def insert_many(
        self,
        collection: typing.Literal[
            "projects", "annotations", "models", "samples", "users", "project_members"
        ],
        models: list[T],
        ids: dict | list[dict] | None = None,
        exclude: set[str] | None = None,
    ):
        ids = ids or {}
        documents = [
            model.model_dump(mode="python", exclude=exclude) for model in models
        ]

        if type(ids) is list:
            if len(ids) != len(models):
                raise ValueError(
                    "If providing IDs as a list, must be the same length as models"
                )
            documents = [{**document, **_id} for document, _id in zip(documents, ids)]
        else:
            documents = [{**document, **ids} for document in documents]

        result = await self.db[collection].insert_many(documents)
        return [str(object_id) for object_id in result.inserted_ids]

    async def update(
        self,
        collection: typing.Literal[
            "projects", "annotations", "models", "samples", "users", "project_members"
        ],
        model: T,
        object_id: ObjectId,
    ):
        updates = model.model_dump(mode="python", exclude_unset=True, exclude_none=True)
        if not updates:
            matched = int(await self.db[collection].count_documents({"_id": object_id}))
            return UpdateResult({"n": matched, "nModified": 0}, acknowledged=True)

        # Only the given fields are written, so concurrent updates to other fields survive.
        return await self.db[collection].update_one(
            {"_id": object_id}, {"$set": updates}
        )

    async def get_document_by_id(
        self,
        collection: typing.Literal[
            "projects", "annotations", "models", "samples", "users", "project_members"
        ],
        object_id: ObjectId,
    ):
        return await self.db[collection].find_one({"_id": object_id})

    async def get_all_documents(
        self, collection: typing.Literal["projects", "annotations", "models", "samples"]
    ):
        all_documents = self.db[collection].find()
        return await all_documents.to_list()

    async def get_filtered_documents(
        self,
        collection: typing.Literal[
            "projects", "annotations", "models", "samples", "users", "project_members"
        ],
        filters: dict | None = None,
        sort_by: str = "_id",
        sort_direction: typing.Literal["ascending", "descending"] = "descending",
        start=0,
        limit=0,
    ):
        direction = (
            pymongo.ASCENDING if sort_direction == "ascending" else pymongo.DESCENDING
        )
        documents = self.db[collection].find(
            filters or {},
            sort=[(sort_by, direction)],
            skip=start,
            limit=limit,
        )
        return await documents.to_list()

    async def delete_filtered_documents(
        self,
        collection: typing.Literal[
            "projects", "annotations", "models", "samples", "users", "project_members"
        ],
        filters: dict | None = None,
    ):
        return await self.db[collection].delete_many(filters or {})

    @asynccontextmanager
    async def lock(
        self, name: str, ttl: float = 30.0, timeout: float = 10.0
    ) -> AsyncIterator[None]:
        """Hold a lock shared by every API worker using this database.

        A lock left behind by a crashed worker is taken over once `ttl` seconds pass.
        Raises LockTimeoutError if the lock is not free within `timeout` seconds.
        """
        locks = self.db["locks"]
        owner = uuid.uuid4().hex
        deadline = time.monotonic() + timeout
        delay = 0.02
        while True:
            now = time.time()
            try:
                await locks.insert_one(
                    {"_id": name, "owner": owner, "expires_at": now + ttl}
                )
                break
            except (pymongo.errors.DuplicateKeyError, mongita.errors.DuplicateKeyError):
                result = await locks.update_one(
                    {"_id": name, "expires_at": {"$lt": now}},
                    {"$set": {"owner": owner, "expires_at": now + ttl}},
                )
                if result.modified_count == 1:
                    break
            if time.monotonic() >= deadline:
                raise LockTimeoutError(f"Timed out waiting for lock {name!r}")
            await asyncio.sleep(delay * random.uniform(0.5, 1.5))
            delay = min(delay * 2, 0.5)
        try:
            yield
        finally:
            await locks.delete_one({"_id": name, "owner": owner})


# Notes to self
# I am planning on doing a collection per route
# Eg Projects, Annotations, Samples, Models etc etc
# These would then be linked via IDs
# So each annotation document would have a 'sample_id' and a 'project_id' for example
# This means that you can search through them using that ID
# Eg above, get_documents_per_project would get you all documents from a collection which are relevant for a certain project
