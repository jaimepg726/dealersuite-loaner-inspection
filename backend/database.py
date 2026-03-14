"""
DealerSuite — Async SQLAlchemy database session
Supports PostgreSQL (Railway production) and SQLite (local dev fallback)
"""

import asyncio
import logging
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# ---------------------------------------------------------------------------
# Engine
# Railway injects DATABASE_URL as postgresql://...
# We swap the scheme to the async driver automatically.
# ---------------------------------------------------------------------------
_raw_url = settings.database_url

# Ensure async driver is used
if _raw_url.startswith("postgresql://"):
    _db_url = _raw_url.replace("postgresql://", "postgresql+asyncpg://", 1)
elif _raw_url.startswith("postgres://"):
    # Heroku / Railway legacy format
    _db_url = _raw_url.replace("postgres://", "postgresql+asyncpg://", 1)
else:
    _db_url = _raw_url  # sqlite+aiosqlite://... or already correct

engine = create_async_engine(
    _db_url,
    echo=settings.environment == "development",  # log SQL in dev only
    pool_pre_ping=True,                           # drop stale connections
    pool_size=5,
    max_overflow=10,
    pool_recycle=300,                             # recycle connections every 5 min
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ---------------------------------------------------------------------------
# Declarative base — all models inherit from this
# ---------------------------------------------------------------------------
class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# FastAPI dependency — yields an async DB session per request.
# Implements exponential backoff retry to survive Postgres recovery restarts.
# ---------------------------------------------------------------------------
async def get_db() -> AsyncSession:
    last_exc = None
    for attempt in range(4):
        if attempt > 0:
            wait = 2 ** attempt  # 2, 4, 8 seconds
            logger.warning("DB connection attempt %d failed, retrying in %ds: %s", attempt, wait, last_exc)
            await asyncio.sleep(wait)
        try:
            async with AsyncSessionLocal() as session:
                try:
                    yield session
                    await session.commit()
                except Exception:
                    await session.rollback()
                    raise
                finally:
                    await session.close()
            return
        except Exception as exc:
            last_exc = exc
    raise last_exc
