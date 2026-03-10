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

# Columns that must be TIMESTAMPTZ (timezone-aware) to avoid asyncpg DataError.
# ALTER TYPE is idempotent when the column is already TIMESTAMPTZ.
_TIMESTAMPTZ_MIGRATIONS = [
    ("loaners",  "checked_out_at"),
    ("loaners",  "checked_in_at"),
    ("vehicles", "created_at"),
    ("vehicles", "updated_at"),
]

# New tables created on every startup if they don't exist.
_CREATE_TABLES = [
    """
    CREATE TABLE IF NOT EXISTS inspection_media (
        id            SERIAL PRIMARY KEY,
        inspection_id INTEGER NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
        file_url      TEXT NOT NULL,
        media_type    VARCHAR(10) NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_inspection_media_inspection_id ON inspection_media(inspection_id)",
]


async def run_migrations(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        for table, column, definition in _MIGRATIONS:
            try:
                await conn.execute(
                    text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {definition}")
                )
                logger.info("Migration: added %s.%s", table, column)
            except Exception:
                pass  # table may not exist yet — normal for optional tables

        for table, column in _TIMESTAMPTZ_MIGRATIONS:
            try:
                await conn.execute(
                    text(
                        f"ALTER TABLE {table} ALTER COLUMN {column} TYPE TIMESTAMPTZ "
                        f"USING {column} AT TIME ZONE 'UTC'"
                    )
                )
                logger.info("Migration: converted %s.%s to TIMESTAMPTZ", table, column)
            except Exception:
                pass  # already TIMESTAMPTZ, table missing, or non-PostgreSQL DB

        for stmt in _CREATE_TABLES:
            try:
                await conn.execute(text(stmt))
                logger.info("Migration: executed table/index creation")
            except Exception:
                pass  # already exists or incompatible DB
