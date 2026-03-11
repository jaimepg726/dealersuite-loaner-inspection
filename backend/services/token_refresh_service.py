"""Proactive Drive token refresh — runs every 30 minutes via startup lifespan."""
import asyncio
import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)


async def refresh_drive_token_if_needed(db_factory):
    """Call this on a schedule. Refreshes if token expires within 10 minutes."""
    try:
        async with db_factory() as db:
            from services.settings_service import (
                get_setting,
                KEY_GOOGLE_TOKEN_EXPIRY,
                KEY_GOOGLE_REFRESH_TOKEN,
            )
            expiry_str    = await get_setting(db, KEY_GOOGLE_TOKEN_EXPIRY)
            refresh_token = await get_setting(db, KEY_GOOGLE_REFRESH_TOKEN)
            if not refresh_token or not expiry_str:
                return
            try:
                expiry = datetime.fromisoformat(expiry_str)
                if expiry.tzinfo is None:
                    expiry = expiry.replace(tzinfo=timezone.utc)
            except ValueError:
                return
            time_left = expiry - datetime.now(timezone.utc)
            if time_left > timedelta(minutes=10):
                return  # Still fresh, skip
            logger.info(
                "Drive: proactive token refresh (%.0f min left)",
                time_left.total_seconds() / 60,
            )
            from storage.drive_backend import GoogleDriveBackend
            backend = GoogleDriveBackend(db)
            creds = await backend._get_credentials()  # This refreshes + saves
            if creds:
                logger.info("Drive: proactive refresh succeeded")
            else:
                logger.warning("Drive: proactive refresh failed — user must reconnect")
    except Exception as exc:
        logger.error("Drive: background refresh error - %s", exc)


async def start_background_refresh(db_factory):
    """Launch as asyncio task from app lifespan."""
    while True:
        await refresh_drive_token_if_needed(db_factory)
        await asyncio.sleep(30 * 60)  # every 30 minutes
