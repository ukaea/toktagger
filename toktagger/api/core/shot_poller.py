import asyncio
import logging
from datetime import datetime, timedelta

from toktagger.api import config
from toktagger.api.core.data_loaders import LoaderRegistry
from toktagger.api.crud import utils
from toktagger.api.crud.db import LockTimeoutError, MongoDBClient
from toktagger.api.schemas.projects import Project

logger = logging.getLogger(__name__)

LOCK_TTL_SECONDS = 300.0


def is_due(project: Project, now: datetime) -> bool:
    """Return True if the project is due a check for new shots."""
    if not project.auto_add_shots or not project.auto_add_shots.enabled:
        return False
    if project.shots_last_checked is None:
        return True
    interval = timedelta(minutes=project.auto_add_shots.interval_minutes)
    return now - project.shots_last_checked >= interval


async def check_project(db_client: MongoDBClient, project_id: str) -> list[int]:
    """Add new shots to one project. Returns the shot IDs which were added."""
    try:
        async with db_client.lock(
            f"shot-poll:{project_id}", ttl=LOCK_TTL_SECONDS, timeout=0.5
        ):
            # Read again inside the lock: another worker may have just checked this project.
            project = await utils.get_project(db_client, project_id)
            now = datetime.now()
            if not is_due(project, now):
                return []
            try:
                loader = LoaderRegistry.get(project.data_loader)
                latest_shot = await asyncio.to_thread(loader.latest_shot)
                added = await utils.add_new_shots(
                    db_client,
                    project,
                    latest_shot,
                    config.settings.polling.max_shots_per_check,
                )
            finally:
                await utils.set_shots_last_checked(db_client, project_id, now)
    except LockTimeoutError:
        return []

    if added:
        logger.info("Added %d new shots to project %s", len(added), project_id)
    return added


async def poll_once(db_client: MongoDBClient) -> None:
    """Check every project which is due a check for new shots."""
    now = datetime.now()
    projects = await utils.get_auto_add_shots_projects(db_client)
    for project in projects:
        if not is_due(project, now):
            continue
        try:
            await check_project(db_client, project.id)
        except Exception:  # noqa: BLE001 -- one bad project or data source must not stop the others
            logger.exception("Could not check project %s for new shots", project.id)


async def run_shot_poller(db_client: MongoDBClient) -> None:
    """Check for new shots until cancelled."""
    while True:
        try:
            await poll_once(db_client)
        except Exception:  # noqa: BLE001 -- keep the poller alive through a database error
            logger.exception("Shot poller failed")
        await asyncio.sleep(config.settings.polling.tick_seconds)
