"""DealerSuite - Lightweight startup migrations
Runs ALTER TABLE ... ADD COLUMN for any columns that don't exist yet.
Safe to run on every startup.
"""
import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

logger = logging.getLogger(__name__)

_MIGRATIONS = [
    ("inspections",      "is_demo",   "BOOLEAN DEFAULT false"),
    ("loaners",          "is_demo",   "BOOLEAN DEFAULT false"),
    ("vehicles",         "is_demo",   "BOOLEAN DEFAULT false"),
    ("porters",          "is_demo",   "BOOLEAN DEFAULT false"),
    ("inspection_media", "file_data", "BYTEA"),
    ("inspection_media", "mime_type", "VARCHAR(50)"),
]

_CREATE_TABLES = [
    """
    CREATE TABLE IF NOT EXISTS inspection_media (
        id SERIAL PRIMARY KEY,
        inspection_id INTEGER REFERENCES inspections(id) ON DELETE CASCADE,
        file_url TEXT NOT NULL,
        media_type VARCHAR(10) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS video_sessions (
        id SERIAL PRIMARY KEY,
        uuid VARCHAR(36) NOT NULL UNIQUE,
        inspection_id INTEGER REFERENCES inspections(id) ON DELETE SET NULL,
        inspector_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
        inspector_name  VARCHAR(200),
        loaner_number   VARCHAR(50),
        inspection_type VARCHAR(50),
        status VARCHAR(50) NOT NULL DEFAULT 'started',
        created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_heartbeat_at    TIMESTAMPTZ,
        recording_started_at TIMESTAMPTZ,
        recording_stopped_at TIMESTAMPTZ,
        upload_started_at    TIMESTAMPTZ,
        upload_finished_at   TIMESTAMPTZ,
        duration_seconds      FLOAT,
        min_duration_required FLOAT,
        min_duration_met  BOOLEAN NOT NULL DEFAULT false,
        last_known_phase  VARCHAR(50),
        failure_reason    VARCHAR(500),
        interruption_type VARCHAR(50),
        app_backgrounded BOOLEAN NOT NULL DEFAULT false,
        app_unloaded     BOOLEAN NOT NULL DEFAULT false,
        upload_started   BOOLEAN NOT NULL DEFAULT false,
        upload_finalized BOOLEAN NOT NULL DEFAULT false
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_video_sessions_status     ON video_sessions (status)",
    "CREATE INDEX IF NOT EXISTS ix_video_sessions_created_at ON video_sessions (created_at)",
    "CREATE INDEX IF NOT EXISTS ix_video_sessions_inspector  ON video_sessions (inspector_id)",
]


async def run_migrations(engine: AsyncEngine) -> None:
    ddl_statements = []
    for ddl in _CREATE_TABLES:
        ddl_statements.append(ddl.strip())
    for table, column, definition in _MIGRATIONS:
        ddl_statements.append(
            f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {definition}"
        )

    for ddl in ddl_statements:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(ddl))
            logger.info("Migration OK: %s", ddl[:80])
        except Exception as exc:
            logger.warning("Migration skipped: %s", exc)

    # ── BYTEA WIPE ────────────────────────────────────────────────────────────
    # Null out file_data on rows that already have a Drive URL.
    # Media is safely stored on Drive and served via /drive-token endpoint.
    # Idempotent — rows already NULL are unaffected.
    _WIPE_BYTEA = """
        UPDATE inspection_media
        SET file_data = NULL
        WHERE file_data IS NOT NULL
        AND file_url LIKE '%drive.google.com%'
    """
    try:
        async with engine.begin() as conn:
            result = await conn.execute(text(_WIPE_BYTEA))
            if result.rowcount:
                logger.info("BYTEA wipe: freed %d Drive-backed rows", result.rowcount)
    except Exception as exc:
        logger.warning("BYTEA wipe skipped: %s", exc)

    # ── STALE RECORD CLEANUP ──────────────────────────────────────────────────
    # ONLY remove records with /tmp paths or blank URLs — never touch Drive URLs.
    # Previous version incorrectly deleted Drive-backed records. Fixed here.
    _CLEANUP = """
        DELETE FROM inspection_media
        WHERE file_url IS NULL
        OR file_url = ''
        OR file_url LIKE '/tmp/%'
    """
    try:
        async with engine.begin() as conn:
            result = await conn.execute(text(_CLEANUP))
            if result.rowcount:
                logger.info("Cleanup: removed %d stale rows", result.rowcount)
    except Exception as exc:
        logger.warning("Cleanup skipped: %s", exc)
