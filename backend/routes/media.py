"""DealerSuite — Media serve endpoint
GET /api/media/{media_id}             — stream BYTEA (legacy DB-only records, no auth)
GET /api/media/{media_id}/drive-token — return Drive access token for direct fetch (auth required)
GET /api/media/{media_id}/stream      — proxy Drive video with Range/206 support (auth via ?token=)

Architecture:
- Drive-backed records (file_url contains drive.google.com): frontend fetches /stream
  which proxies from Google with proper Range support, so browser <video> can seek
  without downloading the full file. Auth via Bearer token in query param (needed
  because browser <video> src= cannot send Authorization headers).
- Legacy DB records (file_url starts with /api/media/): 5 early inspections stored as BYTEA.
  Served via the plain streaming endpoint as before.
"""
import logging
import re
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response, JSONResponse, StreamingResponse
from jose import JWTError, jwt
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

    drive_api_url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"
    return JSONResponse({
        "direct_fetch": True,
        "access_token": access_token,
        "drive_url": drive_api_url,
        "stream_url": f"{drive_api_url}&access_token={access_token}",
        "mime_type": content_type,
    })


@router.get("/{media_id}/stream", summary="Proxy Drive video with Range/206 support")
async def stream_drive_media(
    media_id: int,
    request: Request,
    token: str = Query(..., description="DS JWT — browser <video> cannot send Authorization header"),
    db: AsyncSession = Depends(get_db),
):
    """
    Proxies a Drive-backed video file through Railway, forwarding Range headers
    so the browser can seek immediately without downloading the full file.

    Auth uses ?token= query param because a browser <video src=""> element cannot
    attach Authorization headers — the JWT is validated here identically to the
    Bearer header path.
    """
    # Validate the token manually (same secret / algorithm as normal auth)
    from config import get_settings
    _cfg = get_settings()
    try:
        jwt.decode(token, _cfg.jwt_secret, algorithms=[_cfg.jwt_algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

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

    content_type = media.mime_type or "video/mp4"
    drive_url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"

    req_headers = {"Authorization": f"Bearer {access_token}"}
    range_header = request.headers.get("Range")
    if range_header:
        req_headers["Range"] = range_header

    # Stream through without buffering the full file — important for large videos
    client = httpx.AsyncClient(timeout=httpx.Timeout(30, read=None))
    drive_resp = await client.send(
        httpx.Request("GET", drive_url, headers=req_headers),
        stream=True,
    )

    if drive_resp.status_code not in (200, 206):
        await drive_resp.aclose()
        await client.aclose()
        raise HTTPException(status_code=502, detail=f"Drive fetch failed: {drive_resp.status_code}")

    resp_headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=300",
    }
    for h in ("Content-Range", "Content-Length"):
        if h in drive_resp.headers:
            resp_headers[h] = drive_resp.headers[h]

    async def _stream():
        try:
            async for chunk in drive_resp.aiter_bytes(65536):
                yield chunk
        finally:
            await drive_resp.aclose()
            await client.aclose()

    return StreamingResponse(
        _stream(),
        status_code=drive_resp.status_code,
        headers=resp_headers,
        media_type=content_type,
    )


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
