"""
DealerSuite — Google Drive Service

Uses a service account to create and manage Drive folders/files.

Folder hierarchy created per inspection:
  DealerSuite Loaner Inspections/
    └── Loaner_M499/                  (or VIN_<vin> if no loaner number)
          └── 2026-03-07_Checkout/    (one per inspection event)
                ├── video.mp4
                └── damage_front.jpg

Credentials — two supported modes:
  PROD / Railway:   Set GOOGLE_SERVICE_ACCOUNT_JSON to the base64-encoded
                    contents of service_account.json.
  Local dev:        Place service_account.json in the backend/ directory
                    (or set GOOGLE_SERVICE_ACCOUNT_FILE to its path).

If neither is configured the service degrades gracefully — all Drive calls
become no-ops that return (None, None) so inspections still work offline.
"""

import asyncio
import base64
import io
import json
import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

SCOPES       = ["https://www.googleapis.com/auth/drive"]
MIME_FOLDER  = "application/vnd.google-apps.folder"
FOLDER_BASE  = "https://drive.google.com/drive/folders/{}"
FILE_BASE    = "https://drive.google.com/file/d/{}/view"


# ── Credential builder ───────────────────────────────────────────────────────

def _build_service():
    """
    Build a google-api-python-client Drive v3 service object.
    Returns None when Drive is not configured — callers must handle this.
    """
    try:
        import os
        from googleapiclient.discovery import build
        from google.oauth2.service_account import Credentials
        from config import get_settings

        settings = get_settings()
        creds    = None

        # Option 1: base64-encoded JSON in env var (Railway / any PaaS)
        if settings.google_service_account_json:
            raw  = base64.b64decode(settings.google_service_account_json)
            info = json.loads(raw.decode("utf-8"))
            creds = Credentials.from_service_account_info(info, scopes=SCOPES)

        # Option 2: local service account JSON file
        elif settings.google_service_account_file:
            path = settings.google_service_account_file
            if os.path.isfile(path):
                creds = Credentials.from_service_account_file(path, scopes=SCOPES)
            else:
                logger.info("Drive: service account file '%s' not found — skipping", path)

        if creds is None:
            logger.info("Drive: no credentials configured — Drive features disabled")
            return None

        return build("drive", "v3", credentials=creds, cache_discovery=False)

    except Exception as exc:
        logger.error("Drive: init failed — %s", exc)
        return None


# ── Synchronous helpers (run in thread pool so we don't block the event loop) ─

def _sync_find_or_create_folder(
    service,
    name: str,
    parent_id: Optional[str] = None,
) -> tuple[str, str]:
    """
    Look for an existing folder with *name* inside *parent_id*.
    Creates it if it does not exist.
    Returns (folder_id, folder_url).
    """
    # Build search query
    query_parts = [
        f"mimeType = '{MIME_FOLDER}'",
        f"name = '{name}'",
        "trashed = false",
    ]
    if parent_id:
        query_parts.append(f"'{parent_id}' in parents")

    resp = service.files().list(
        q=" and ".join(query_parts),
        spaces="drive",
        fields="files(id, name)",
        pageSize=1,
    ).execute()

    files = resp.get("files", [])
    if files:
        folder_id = files[0]["id"]
        logger.debug("Drive: found folder '%s' → %s", name, folder_id)
        return folder_id, FOLDER_BASE.format(folder_id)

    # Create the folder
    meta = {"name": name, "mimeType": MIME_FOLDER}
    if parent_id:
        meta["parents"] = [parent_id]

    folder = service.files().create(
        body=meta, fields="id"
    ).execute()
    folder_id = folder["id"]

    # Make it readable by anyone with the link (so managers can open it)
    service.permissions().create(
        fileId=folder_id,
        body={"role": "reader", "type": "anyone"},
    ).execute()

    logger.info("Drive: created folder '%s' → %s", name, folder_id)
    return folder_id, FOLDER_BASE.format(folder_id)


def _sync_upload_file(
    service,
    folder_id: str,
    filename: str,
    content: bytes,
    mimetype: str,
) -> tuple[str, str]:
    """
    Upload *content* as *filename* into *folder_id*.
    Returns (file_id, file_url).
    """
    from googleapiclient.http import MediaIoBaseUpload

    meta  = {"name": filename, "parents": [folder_id]}
    media = MediaIoBaseUpload(io.BytesIO(content), mimetype=mimetype, resumable=True)

    file_obj = service.files().create(
        body=meta, media_body=media, fields="id"
    ).execute()
    file_id = file_obj["id"]

    # Anyone-with-link read permission
    service.permissions().create(
        fileId=file_id,
        body={"role": "reader", "type": "anyone"},
    ).execute()

    logger.info("Drive: uploaded '%s' (%d bytes) → %s", filename, len(content), file_id)
    return file_id, FILE_BASE.format(file_id)


# ── Public async API ─────────────────────────────────────────────────────────

async def get_or_create_inspection_folder(
    loaner_number: Optional[str],
    vin: str,
    inspection_type: str,
    started_at: datetime,
) -> tuple[Optional[str], Optional[str]]:
    """
    Ensure the full folder path exists and return the inspection-level folder.

    Path:
        DealerSuite Loaner Inspections/
          └── Loaner_M499/   (or VIN_<vin> if no loaner number)
                └── 2026-03-07_Checkout/

    Returns:
        (folder_id, folder_url) or (None, None) if Drive is not configured.
    """
    loop    = asyncio.get_event_loop()
    service = await loop.run_in_executor(None, _build_service)
    if service is None:
        return None, None

    from config import get_settings
    settings = get_settings()

    try:
        def _run():
            # 1. Root folder
            root_id, _ = _sync_find_or_create_folder(
                service,
                settings.google_drive_root_folder_name,
            )

            # 2. Vehicle folder
            vehicle_label = f"Loaner_{loaner_number}" if loaner_number else f"VIN_{vin}"
            vehicle_id, _ = _sync_find_or_create_folder(
                service, vehicle_label, parent_id=root_id
            )

            # 3. Inspection folder  e.g. "2026-03-07_Checkout"
            date_str       = started_at.strftime("%Y-%m-%d")
            insp_folder    = f"{date_str}_{inspection_type}"
            insp_id, insp_url = _sync_find_or_create_folder(
                service, insp_folder, parent_id=vehicle_id
            )
            return insp_id, insp_url

        folder_id, folder_url = await loop.run_in_executor(None, _run)
        return folder_id, folder_url

    except Exception as exc:
        logger.error("Drive: folder creation failed — %s", exc)
        return None, None


async def upload_file(
    folder_id: str,
    filename: str,
    content: bytes,
    mimetype: str,
) -> tuple[Optional[str], Optional[str]]:
    """
    Upload a file into an existing Drive folder.
    Returns (file_id, file_url) or (None, None) on failure.
    """
    if not folder_id:
        return None, None

    loop    = asyncio.get_event_loop()
    service = await loop.run_in_executor(None, _build_service)
    if service is None:
        return None, None

    try:
        file_id, file_url = await loop.run_in_executor(
            None,
            _sync_upload_file,
            service,
            folder_id,
            filename,
            content,
            mimetype,
        )
        return file_id, file_url
    except Exception as exc:
        logger.error("Drive: upload failed for '%s' — %s", filename, exc)
        return None, None


async def upload_video(
    folder_id: str,
    content: bytes,
    inspection_type: str,
    started_at: datetime,
) -> tuple[Optional[str], Optional[str]]:
    """Convenience wrapper: upload an inspection video with a standardised name."""
    date_str  = started_at.strftime("%Y-%m-%d")
    filename  = f"{date_str}_{inspection_type}_video.mp4"
    return await upload_file(folder_id, filename, content, "video/mp4")


async def upload_damage_photo(
    folder_id: str,
    content: bytes,
    location: str,
    index: int = 1,
) -> tuple[Optional[str], Optional[str]]:
    """Convenience wrapper: upload a damage photo with a standardised name."""
    safe     = location.lower().replace(" ", "_")
    filename = f"damage_{safe}_{index:02d}.jpg"
    return await upload_file(folder_id, filename, content, "image/jpeg")
