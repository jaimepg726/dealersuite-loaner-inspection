"""DealerSuite — Lightweight startup migrations
Runs ALTER TABLE ... ADD COLUMN for any columns that don't exist yet.
Safe to run on every startup — errors from already-existing columns are swallowed.
"""
import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

logger = logging.getLogger(__name__)

_MIGRATIONS = [
    ("inspections", "is_demo", "BOOLEAN NOT NULL DEFAULT false"),
    ("loaners",     "is_demo", "BOOLEAN NOT NULL DEFAULT false"),
    ("vehicles",    "is_demo", "BOOLEAN NOT NULL DEFAULT false"),
]


async def run_migrations(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        for table, column, definition in _MIGRATIONS:
            try:
                await conn.execute(
                    text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
                )
                logger.info("Migration: added %s.%s", table, column)
            except Exception:
                pass  # column already exists — normal on subsequent startups
