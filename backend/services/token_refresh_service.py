"""DealerSuite - Drive token refresh (lazy evaluation)

Tokens are now refreshed just-in-time inside get_valid_access_token()
in storage/drive_backend.py — called at the moment a Drive API route is invoked.

The old background asyncio.sleep loop has been removed to save RAM and CPU.
This module exposes a no-op start_background_refresh so main.py doesn't break
during the transition; it simply does nothing.
"""
import logging

logger = logging.getLogger(__name__)


async def start_background_refresh(db_factory):
    """No-op stub — token refresh is now lazy (just-in-time) in drive_backend.py."""
    logger.info("Drive: background token refresh loop disabled — using lazy evaluation")
