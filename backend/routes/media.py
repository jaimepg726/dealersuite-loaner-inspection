"""DealerSuite — Media redirect endpoint
GET /api/media/{media_id}  → redirect to the Drive URL stored in inspection_media.file_url

Media is now stored on Google Drive (direct-to-Drive architecture).
This endpoint looks up the Drive URL from the database and issues a permanent
redirect so existing <img>/<video> tags keep working without any frontend changes.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.inspection_media import InspectionMedia

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/{media_id}", summary="Redirect to Drive media URL")
async def serve_media(
    media_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(InspectionMedia).where(InspectionMedia.id == media_id)
    )
    media = result.scalar_one_or_none()

    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    if not media.file_url or media.file_url.startswith("/api/media/"):
        raise HTTPException(status_code=404, detail="Media file not available — no Drive URL stored")

    return RedirectResponse(url=media.file_url, status_code=302)
