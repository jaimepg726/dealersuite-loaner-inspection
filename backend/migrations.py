"""DealerSuite — Lightweight startup migrations
Runs ALTER TABLE ... ADD COLUMN for any columns that don't exist yet.
Safe to run on every startup — errors from already-existing columns are swallowed.
"""
import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

logger = logging.getLogger(__name__)

_MIGRATIONS = [
    ("inspections", "is_demo", "BOOLEAN DEFAULT false"),
    ("loaners",     "is_demo", "BOOLEAN DEFAULT false"),
    ("vehicles",    "is_demo", "BOOLEAN DEFAULT false"),
    ("porters",     "is_demo", "BOOLEAN DEFAULT false"),
]

# DDL statements run once on startup (CREATE TABLE IF NOT EXISTS is idempotent)
_CREATE_TABLES = [
    """
    CREATE TABLE IF NOT EXISTS inspection_media (
        id            SERIAL PRIMARY KEY,
        inspection_id INTEGER REFERENCES inspections(id) ON DELETE CASCADE,
        file_url      TEXT NOT NULL,
        media_type    VARCHAR(10) NOT NULL,
        created_at    TIMESTAMPTZ DEFAULT now()
    )
    """,
]


async def run_migrations(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        # CREATE TABLE migrations (idempotent)
        for ddl in _CREATE_TABLES:
            try:
                await conn.execute(text(ddl))
                logger.info("Migration: executed CREATE TABLE IF NOT EXISTS")
            except Exception as exc:
                logger.warning("Migration: CREATE TABLE skipped — %s", exc)

        # ADD COLUMN migrations (idempotent)
        for table, column, definition in _MIGRATIONS:
            try:
                await conn.execute(
                    text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {definition}")
                )
                logger.info("Migration: added %s.%s", table, column)
            except Exception:
                pass  # table may not exist yet — normal for optional tables
