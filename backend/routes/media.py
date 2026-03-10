"""DealerSuite — Media serve endpoint
GET /api/media/{media_id}  → stream file bytes stored in inspection_media.file_data

No authentication required so <img> and <video> tags work directly in browsers.
Supports Range requests so HTML5 video seeking works on all devices.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.inspection_media import InspectionMedia

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/{media_id}", summary="Serve media file from database")
async def serve_media(
    media_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(InspectionMedia).where(InspectionMedia.id == media_id)
    )
    media = result.scalar_one_or_none()

    if not media or not media.file_data:
        raise HTTPException(status_code=404, detail="Media not found")

    data         = bytes(media.file_data)
    total        = len(data)
    content_type = media.mime_type or (
        "image/jpeg" if media.media_type == "photo" else "video/mp4"
    )

    # Handle Range requests — required for HTML5 video seeking in most browsers
    range_header = request.headers.get("Range")
    if range_header and range_header.startswith("bytes="):
        try:
            ranges    = range_header[6:].split(",")[0].strip()
            start_str, end_str = ranges.split("-")
            start = int(start_str) if start_str else 0
            end   = int(end_str)   if end_str   else total - 1
            end   = min(end, total - 1)
            chunk = data[start : end + 1]
            return Response(
                content=chunk,
                status_code=206,
                media_type=content_type,
                headers={
                    "Content-Range":  f"bytes {start}-{end}/{total}",
                    "Accept-Ranges":  "bytes",
                    "Content-Length": str(len(chunk)),
                    "Cache-Control":  "private, max-age=86400",
                },
            )
        except Exception:
            pass  # fall through to full response on malformed Range header

    return Response(
        content=data,
        media_type=content_type,
        headers={
            "Accept-Ranges":  "bytes",
            "Content-Length": str(total),
            "Cache-Control":  "private, max-age=86400",
        },
    )
