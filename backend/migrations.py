"""DealerSuite — Lightweight startup migrations
Runs idempotent DDL for any columns/indexes that don't exist yet.
Safe to run on every startup — errors from already-existing objects are swallowed.

NOTE: file_data (BYTEA) is intentionally preserved for legacy record backfilling.
      It is NOT dropped here.
"""
import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

logger = logging.getLogger(__name__)

# ADD COLUMN IF NOT EXISTS migrations: (table, column, definition)
_COLUMN_MIGRATIONS = [
    ("inspections",      "is_demo",        "BOOLEAN DEFAULT false"),
    ("loaners",          "is_demo",        "BOOLEAN DEFAULT false"),
    ("vehicles",         "is_demo",        "BOOLEAN DEFAULT false"),
    ("vehicles",         "fuel_level",     "VARCHAR(10)"),
    # inspection_media legacy + new Direct-to-Drive columns
    ("inspection_media", "mime_type",      "VARCHAR(50)"),
    ("inspection_media", "file_hash",      "VARCHAR(64)"),
    ("inspection_media", "drive_file_id",  "VARCHAR(200)"),
    ("inspection_media", "drive_url",      "VARCHAR(500)"),
    ("inspection_media", "file_size",      "INTEGER"),
    ("inspection_media", "uploaded_at",    "TIMESTAMPTZ"),
]

# CREATE INDEX IF NOT EXISTS migrations: (index_name, table, column)
_INDEX_MIGRATIONS = [
    ("ix_inspection_media_file_hash",    "inspection_media", "file_hash"),
    ("ix_inspection_media_created_at",   "inspection_media", "created_at"),
    ("ix_inspections_started_at",        "inspections",      "started_at"),
]

# Raw DDL run once (CREATE TABLE IF NOT EXISTS is idempotent)
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
    ddl_statements = []

    for ddl in _CREATE_TABLES:
        ddl_statements.append(ddl.strip())

    for table, column, definition in _COLUMN_MIGRATIONS:
        ddl_statements.append(
            f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {definition}"
        )

    for index_name, table, column in _INDEX_MIGRATIONS:
        ddl_statements.append(
            f"CREATE INDEX IF NOT EXISTS {index_name} ON {table} ({column})"
        )

    for ddl in ddl_statements:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(ddl))
            logger.info("Migration OK: %s", ddl[:80])
        except Exception as exc:
            logger.warning("Migration skipped (already applied?): %s", exc)
