"""
Alembic environment — synchronous psycopg2 migration runner.

Why sync instead of asyncpg?
  The FastAPI app uses asyncpg at runtime for non-blocking queries, but
  Alembic works most reliably with a plain synchronous engine + psycopg2.
  psycopg2-binary is already in requirements.txt.
"""

from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

# ---------------------------------------------------------------------------
# Import all models so Alembic can detect schema changes
# ---------------------------------------------------------------------------
from database import Base  # noqa: F401
import models              # noqa: F401 — registers User, Vehicle, Inspection, Damage

from config import get_settings

settings = get_settings()

# Alembic Config object
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# ---------------------------------------------------------------------------
# Build a SYNC psycopg2 URL from whatever DATABASE_URL Railway provides.
# Railway injects:  postgres://...  or  postgresql://...
# We need:          postgresql+psycopg2://...
# ---------------------------------------------------------------------------
_raw_url = settings.database_url

if _raw_url.startswith("postgres://"):
    _sync_url = _raw_url.replace("postgres://", "postgresql+psycopg2://", 1)
elif _raw_url.startswith("postgresql://"):
    _sync_url = _raw_url.replace("postgresql://", "postgresql+psycopg2://", 1)
elif _raw_url.startswith("postgresql+asyncpg://"):
    _sync_url = _raw_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://", 1)
else:
    _sync_url = _raw_url  # already correct or SQLite for local dev

config.set_main_option("sqlalchemy.url", _sync_url)


# ---------------------------------------------------------------------------
# Migration helpers
# ---------------------------------------------------------------------------

def run_migrations_offline() -> None:
    """Run without a live DB connection (used for SQL script generation)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run against a live DB using a synchronous psycopg2 connection."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
