import datetime


def utcnow() -> datetime.datetime:
    """Return the current UTC time as a timezone-aware datetime.

    Use this everywhere instead of datetime.datetime.now to prevent
    asyncpg errors: can't subtract offset-naive and offset-aware datetimes.
    """
    return datetime.datetime.now(datetime.timezone.utc)
