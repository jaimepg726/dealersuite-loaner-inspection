"""DealerSuite Ã¢ÂÂ System Status Route
GET /api/system/status  -> health snapshot for the Settings UI
"""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from services.settings_service import get_setting, KEY_GOOGLE_ACCESS_TOKEN

router = APIRouter()


@router.get("/status", summary="System health snapshot")
async def system_status(
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    # DB check
    try:
        await db.execute(text("SELECT 1"))
        database = "connected"
    except Exception:
        database = "error"

    # Google Drive token presence Ã¢ÂÂ storage mode
    token = await get_setting(db, KEY_GOOGLE_ACCESS_TOKEN)
    google_drive_connected = bool(token)

    return {
        "database": "ok" if database == "connected" else database,
        "storage_mode": "drive" if google_drive_connected else "local",
        "google_drive_connected": google_drive_connected,
        "version": "1.0",
    }
