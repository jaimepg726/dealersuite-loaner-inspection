#!/usr/bin/env python3
"""
Emergency disk reclamation script — VACUUM FULL inspection_media.

Background
----------
Setting file_data = NULL removes the reference to a BYTEA value but Postgres
does NOT immediately return that disk space to the OS.  The dead tuples remain
on the heap until a VACUUM FULL rewrites the entire table, releasing the freed
pages back to the filesystem.

VACUUM FULL takes an ACCESS EXCLUSIVE lock — all reads and writes on
inspection_media will block for the duration.  Run during a maintenance window
or when application load is minimal.

Typical runtime: seconds to a few minutes depending on table size.

Usage (Railway CLI):
    railway run python scripts/vacuum_db.py

Must be run from the backend/ directory (or with PYTHONPATH pointing to it).
"""

import asyncio
import logging
import os
import sys
import time

# ---------------------------------------------------------------------------
# Path bootstrap
# ---------------------------------------------------------------------------
_here = os.path.dirname(os.path.abspath(__file__))
_backend_root = os.path.dirname(_here)
if _backend_root not in sys.path:
    sys.path.insert(0, _backend_root)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

TABLE = "inspection_media"


# ---------------------------------------------------------------------------
# Helper: human-readable table size via pg_total_relation_size
# ---------------------------------------------------------------------------

async def _table_size(conn, table: str) -> str:
    """Return pretty-printed size of a table (heap + TOAST + indexes)."""
    row = await conn.fetchrow(
        "SELECT pg_size_pretty(pg_total_relation_size($1::regclass)) AS size",
        table,
    )
    return row["size"] if row else "unknown"


async def _null_count(conn, table: str) -> int:
    """Return the count of rows where file_data IS NULL (post-backfill rows)."""
    row = await conn.fetchrow(
        f"SELECT COUNT(*) AS n FROM {table} WHERE file_data IS NULL"
    )
    return row["n"] if row else -1


async def _total_count(conn, table: str) -> int:
    row = await conn.fetchrow(f"SELECT COUNT(*) AS n FROM {table}")
    return row["n"] if row else -1


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def run() -> None:
    import asyncpg
    from config import get_settings

    cfg = get_settings()

    # asyncpg expects a plain postgresql:// URL (no SQLAlchemy driver prefix)
    db_url = cfg.database_url
    for prefix, replacement in (
        ("postgresql+asyncpg://", "postgresql://"),
        ("postgres+asyncpg://", "postgresql://"),
        ("postgres://", "postgresql://"),
    ):
        if db_url.startswith(prefix):
            db_url = replacement + db_url[len(prefix):]
            break

    logger.info("=== vacuum_db.py starting ===")
    logger.info("Table target: %s", TABLE)
    logger.info("Connecting to database...")

    conn = await asyncpg.connect(db_url)
    try:
        total = await _total_count(conn, TABLE)
        null_rows = await _null_count(conn, TABLE)
        before_size = await _table_size(conn, TABLE)

        logger.info("Rows in %s: %d total, %d with file_data=NULL (eligible for reclamation)", TABLE, total, null_rows)
        logger.info("Size BEFORE vacuum: %s", before_size)

        if null_rows == 0:
            logger.warning(
                "No rows have file_data=NULL yet. "
                "Run rescue_backfill.py first to null out the BYTEA values, "
                "then re-run this script."
            )
            return

        logger.info(
            "Starting VACUUM FULL %s — the table will be locked until complete...",
            TABLE,
        )

        t_start = time.monotonic()
        # VACUUM FULL must run outside a transaction block.
        # asyncpg connections are in autocommit mode by default outside
        # explicit transaction() contexts, so this is safe to call directly.
        await conn.execute(f"VACUUM FULL {TABLE}")
        elapsed = time.monotonic() - t_start

        after_size = await _table_size(conn, TABLE)

        logger.info("VACUUM FULL completed in %.1f s", elapsed)
        logger.info("Size BEFORE vacuum: %s", before_size)
        logger.info("Size AFTER  vacuum: %s", after_size)
        logger.info("Disk space has been returned to the OS. Railway volume usage should drop.")
        logger.info("=== vacuum_db.py done ===")

    finally:
        await conn.close()


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
