"""DealerSuite — Video Frame Serve Endpoint
GET /api/frames/{frame_id}  → stream JPEG frame from inspection_video_frames

No authentication required so <img> tags load directly in manager browsers.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.inspection_video_frames import InspectionVideoFrame

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/{frame_id}", summary="Serve extracted video frame image")
async def serve_frame(
    frame_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(InspectionVideoFrame).where(InspectionVideoFrame.id == frame_id)
    )
    frame = result.scalar_one_or_none()

    if not frame or not frame.frame_data:
        raise HTTPException(status_code=404, detail="Frame not found")

    return Response(
        content=bytes(frame.frame_data),
        media_type="image/jpeg",
        headers={
            "Content-Length": str(len(frame.frame_data)),
            "Cache-Control":  "private, max-age=86400",
        },
    )
