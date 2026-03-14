"""DealerSuite — Media serve endpoint
GET /api/media/{media_id}             — stream BYTEA (legacy DB-only records, no auth)
GET /api/media/{media_id}/drive-token — return Drive access token for direct fetch (auth required)

Architecture:
- Drive-backed records (file_url contains drive.google.com): frontend fetches this endpoint
  to get a fresh access token, then fetches the file directly from Google — Railway never
  touches the bytes.
- Legacy DB records (file_url starts with /api/media/): 5 early inspections stored as BYTEA.
  Served via the plain streaming endpoint as before.
"""
import logging
import re
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response, JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from dependencies import get_current_user
from models.inspection_media import InspectionMedia

logger = logging.getLogger(__name__)
router = APIRouter()


def _extract_drive_file_id(url: str) -> str | None:
    """Extract Drive file ID from any Drive URL format."""
    if not url:
        return None
    m = re.search(r'/d/([a-zA-Z0-9_-]+)', url)
    if m:
        return m.group(1)
    m = re.search(r'[?&]id=([a-zA-Z0-9_-]+)', url)
    if m:
        return m.group(1)
    return None


@router.get("/{media_id}/drive-token", summary="Get Drive access token for direct media fetch")
async def get_drive_token(
    media_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Returns a fresh Drive access token + direct API URL so the frontend can
    fetch the file directly from Google without routing bytes through Railway.
    Auth required — never expose Drive tokens to unauthenticated requests.
    """
    result = await db.execute(select(InspectionMedia).where(InspectionMedia.id == media_id))
    media = result.scalar_one_or_none()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    file_id = _extract_drive_file_id(media.file_url)
    if not file_id:
        raise HTTPException(status_code=404, detail="No Drive file associated with this record")

    from storage.drive_backend import GoogleDriveBackend
    drive = GoogleDriveBackend(db)
    access_token = await drive._get_access_token()
    if not access_token:
        raise HTTPException(status_code=503, detail="Drive not connected — reconnect in Settings")

    content_type = media.mime_type or (
        "video/mp4" if media.media_type == "video" else "image/jpeg"
    )

    return JSONResponse({
        "direct_fetch": True,
        "access_token": access_token,
        "drive_url": f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media",
        "mime_type": content_type,
    })


@router.get("/{media_id}", summary="Stream legacy DB media (no auth — for 5 legacy BYTEA records)")
async def serve_media(
    media_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Legacy endpoint — only used for the ~5 early inspections stored as BYTEA.
    Drive-backed records use /drive-token instead.
    """
    result = await db.execute(select(InspectionMedia).where(InspectionMedia.id == media_id))
    media = result.scalar_one_or_none()
    if not media or not media.file_data:
        raise HTTPException(status_code=404, detail="Media not found")

    data = bytes(media.file_data)
    total = len(data)
    content_type = media.mime_type or (
        "image/jpeg" if media.media_type == "photo" else "video/mp4"
    )

    range_header = request.headers.get("Range")
    if range_header and range_header.startswith("bytes="):
        try:
            ranges = range_header[6:].split(",")[0].strip()
            start_str, end_str = ranges.split("-")
            start = int(start_str) if start_str else 0
            end = int(end_str) if end_str else total - 1
            end = min(end, total - 1)
            chunk = data[start : end + 1]
            return Response(
                content=chunk, status_code=206, media_type=content_type,
                headers={
                    "Content-Range": f"bytes {start}-{end}/{total}",
                    "Accept-Ranges": "bytes",
                    "Content-Length": str(len(chunk)),
                    "Cache-Control": "private, max-age=86400",
                },
            )
        except Exception:
            pass

    return Response(
        content=data, media_type=content_type,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(total),
            "Cache-Control": "private, max-age=86400",
        },
    )
