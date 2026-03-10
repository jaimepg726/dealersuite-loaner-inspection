"""DealerSuite — Lightweight startup migrations
Runs ALTER TABLE ... ADD COLUMN for any columns that don't exist yet.
Safe to run on every startup — errors from already-existing columns are swallowed.
"""
import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

logger = logging.getLogger(__name__)

_MIGRATIONS = [
    ("inspections",     "is_demo",   "BOOLEAN DEFAULT false"),
    ("loaners",         "is_demo",   "BOOLEAN DEFAULT false"),
    ("vehicles",        "is_demo",   "BOOLEAN DEFAULT false"),
    ("porters",         "is_demo",   "BOOLEAN DEFAULT false"),
    ("inspection_media","file_data", "BYTEA"),
    ("inspection_media","mime_type", "VARCHAR(50)"),
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
    # Build the full ordered list of DDL statements to execute
    ddl_statements = []

    for ddl in _CREATE_TABLES:
        ddl_statements.append(ddl.strip())

    for table, column, definition in _MIGRATIONS:
        ddl_statements.append(
            f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {definition}"
        )

    # Run each statement in its own transaction.
    # This is critical: PostgreSQL aborts the entire transaction on any error,
    # so a single shared transaction would silently skip all subsequent statements
    # after the first failure. Independent transactions isolate each DDL.
    for ddl in ddl_statements:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(ddl))
            logger.info("Migration OK: %s", ddl[:80])
        except Exception as exc:
            logger.warning("Migration skipped (already applied?): %s", exc)
