#!/usr/bin/env python3
"""
Emergency rescue script — backfill legacy BYTEA media files to Google Drive
and null-out file_data to reclaim PostgreSQL disk space.

Each record is processed and committed individually so that:
  • Memory never accumulates (no bulk loads of BYTEA blobs).
  • Progress is preserved across restarts (already-migrated rows are skipped).
  • A single failed upload does not roll back previously completed work.

Usage (Railway CLI):
    railway run python scripts/rescue_backfill.py
    railway run python scripts/rescue_backfill.py --dry-run
    railway run python scripts/rescue_backfill.py --limit 50

Must be run from the backend/ directory (or with PYTHONPATH pointing to it).
"""

import asyncio
import logging
import os
import sys
import argparse
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Path bootstrap — allow invocation from backend/ or backend/scripts/
# ---------------------------------------------------------------------------
_here = os.path.dirname(os.path.abspath(__file__))
_backend_root = os.path.dirname(_here)
if _backend_root not in sys.path:
    sys.path.insert(0, _backend_root)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

DRIVE_API = "https://www.googleapis.com/drive/v3"
DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3"


# ---------------------------------------------------------------------------
# Drive helpers
# ---------------------------------------------------------------------------

async def _upload_bytes_to_drive(
    data: bytes,
    filename: str,
    mime_type: str,
    folder_id: str,
    access_token: str,
) -> dict:
    """
    Upload raw bytes via Google Drive Resumable Upload protocol.

    Flow:
      1. POST  → initiate session, receive Location URI
      2. PUT   → send file bytes to Location URI
      3. Parse response for file id and webViewLink

    Returns a dict with at least {"id": ..., "webViewLink": ...}.
    Raises RuntimeError on any non-2xx Drive response.
    """
    import json
    import httpx

    metadata = json.dumps({"name": filename, "parents": [folder_id]}).encode()

    init_headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mime_type,
        "X-Upload-Content-Length": str(len(data)),
        "Content-Length": str(len(metadata)),
    }

    async with httpx.AsyncClient(timeout=30) as client:
        init_resp = await client.post(
            f"{DRIVE_UPLOAD_API}/files",
            params={"uploadType": "resumable", "fields": "id,webViewLink"},
            headers=init_headers,
            content=metadata,
        )

    if init_resp.status_code not in (200, 201):
        raise RuntimeError(
            f"Drive initiate-session failed {init_resp.status_code}: {init_resp.text[:300]}"
        )

    upload_uri = init_resp.headers.get("Location")
    if not upload_uri:
        raise RuntimeError("Drive did not return a Location header for the resumable session")

    async with httpx.AsyncClient(timeout=120) as client:
        upload_resp = await client.put(
            upload_uri,
            content=data,
            headers={
                "Content-Length": str(len(data)),
                "Content-Type": mime_type,
            },
        )

    if upload_resp.status_code not in (200, 201):
        raise RuntimeError(
            f"Drive upload failed {upload_resp.status_code}: {upload_resp.text[:300]}"
        )

    return upload_resp.json()


async def _set_public(file_id: str, access_token: str) -> None:
    """Grant anyone-reader access to a Drive file (best-effort, no exception raised)."""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            await client.post(
                f"{DRIVE_API}/files/{file_id}/permissions",
                json={"role": "reader", "type": "anyone"},
                headers={"Authorization": f"Bearer {access_token}"},
            )
    except Exception as exc:
        logger.warning("set_public(%s) failed (non-fatal): %s", file_id, exc)


# ---------------------------------------------------------------------------
# Main migration logic
# ---------------------------------------------------------------------------

async def run(dry_run: bool = False, limit: int = 0) -> None:
    from sqlalchemy import select, func
    from database import AsyncSessionLocal
    from models.inspection_media import InspectionMedia
    from storage.drive_backend import get_valid_access_token, ensure_folders

    logger.info(
        "=== rescue_backfill.py starting (dry_run=%s, limit=%s) ===",
        dry_run,
        limit or "unlimited",
    )

    # ------------------------------------------------------------------
    # Pre-flight: count rows and validate Drive credentials
    # ------------------------------------------------------------------
    async with AsyncSessionLocal() as db:
        count_q = select(func.count(InspectionMedia.id)).where(
            InspectionMedia.file_data.isnot(None)
        )
        total = (await db.execute(count_q)).scalar_one()
        logger.info("Records with non-null file_data: %d", total)

        if total == 0:
            logger.info("Nothing to migrate. Exiting.")
            return

        token = await get_valid_access_token(db)
        if not token:
            logger.error(
                "No valid Google Drive access token — cannot proceed. "
                "Connect Google Drive via the admin UI first."
            )
            sys.exit(1)

        folders = await ensure_folders(db)
        logger.info("Drive folders ready: %s", folders)

    # ------------------------------------------------------------------
    # Process records one at a time
    #
    # Strategy: always query for the *first* remaining record (offset=0)
    # after a successful migration, because the row disappears from the
    # result set once file_data is set to NULL.  On failure we advance
    # an explicit skip_offset to move past the stuck row.
    # ------------------------------------------------------------------
    processed = 0
    skipped = 0
    errors = 0
    skip_offset = 0  # moves forward only when a record fails

    while True:
        if limit and processed >= limit:
            logger.info("Reached --limit %d. Stopping.", limit)
            break

        async with AsyncSessionLocal() as db:
            # Re-validate token every iteration (long-running script)
            token = await get_valid_access_token(db)
            if not token:
                logger.error("Drive token became invalid mid-run — stopping.")
                break

            folders = await ensure_folders(db)

            # Query for the next un-migrated record, skipping errored ones
            q = (
                select(InspectionMedia)
                .where(InspectionMedia.file_data.isnot(None))
                .order_by(InspectionMedia.id)
                .offset(skip_offset)
                .limit(1)
            )
            result = await db.execute(q)
            media = result.scalar_one_or_none()

            if media is None:
                logger.info("No more records to process.")
                break

            record_id = media.id
            data_len = len(media.file_data) if media.file_data else 0
            mime = media.mime_type or (
                "image/jpeg" if (media.media_type or "photo") == "photo" else "video/mp4"
            )
            media_type = media.media_type or "photo"

            # Derive a filename from the stored file_url (best-effort)
            original_name = (media.file_url or "").split("/")[-1].split("?")[0]
            if not original_name or "." not in original_name:
                ext = "jpg" if media_type == "photo" else "mp4"
                original_name = f"rescue_id{record_id}.{ext}"

            # Route photos to inspections folder, everything else to damage
            folder_id = folders.get(
                "damage" if media_type == "damage" else "inspections",
                folders["inspections"],
            )

            logger.info(
                "[%d/%d] id=%d  size=%s B  mime=%s  file=%s",
                processed + errors + skipped + 1,
                total,
                record_id,
                f"{data_len:,}",
                mime,
                original_name,
            )

            if dry_run:
                logger.info("  DRY RUN — skipping upload.")
                skip_offset += 1
                skipped += 1
                continue

            try:
                drive_info = await _upload_bytes_to_drive(
                    data=media.file_data,
                    filename=original_name,
                    mime_type=mime,
                    folder_id=folder_id,
                    access_token=token,
                )

                file_id = drive_info.get("id")
                web_link = drive_info.get(
                    "webViewLink",
                    f"https://drive.google.com/file/d/{file_id}/view",
                )

                await _set_public(file_id, token)

                # Persist Drive metadata and null out BYTEA — then commit
                media.drive_file_id = file_id
                media.drive_url = web_link
                media.file_size = data_len
                media.uploaded_at = datetime.now(timezone.utc)
                media.file_data = None  # <-- release BYTEA storage

                await db.commit()
                logger.info("  uploaded file_id=%s — file_data nulled and committed", file_id)
                processed += 1
                # skip_offset stays the same: this record is now gone from
                # the un-migrated result set, so the next one slides up.

            except Exception as exc:
                await db.rollback()
                logger.error("  FAILED id=%d: %s", record_id, exc)
                errors += 1
                skip_offset += 1  # advance past the failing record

    logger.info(
        "=== rescue_backfill.py complete — migrated=%d  dry_run_skipped=%d  errors=%d ===",
        processed,
        skipped,
        errors,
    )
    if errors:
        logger.warning("%d records failed — re-run the script to retry them.", errors)
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill legacy BYTEA inspection media to Google Drive"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Log what would be migrated without uploading or modifying any data",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        metavar="N",
        help="Stop after processing N records (0 = no limit, default: 0)",
    )
    args = parser.parse_args()
    asyncio.run(run(dry_run=args.dry_run, limit=args.limit))


if __name__ == "__main__":
    main()
