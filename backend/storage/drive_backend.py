"""DealerSuite - GoogleDriveBackend (Direct-to-Drive architecture)

The backend NO LONGER proxies media payloads.
Instead it:
  1. Generates a Resumable Upload Session URL the browser can PUT directly to.
  2. Exposes a metadata-save endpoint the browser calls after upload completes.

Token refresh is lazy — evaluated only when a Drive route is invoked.
Folder IDs are cached in app_settings — never recreated unless missing.
"""
import logging
import re
from datetime import datetime, timezone, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

DRIVE_FILE_BASE = "https://drive.google.com/uc?id={}&export=view"
ROOT_FOLDER = "DealerSuite Loaner Inspections"

DRIVE_API        = "https://www.googleapis.com/drive/v3"
DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3"


def sanitize_loaner_number(loaner: Optional[str]) -> str:
    if not loaner:
        return "UNKNOWN"
    safe = re.sub(r"[^A-Za-z0-9]", "", loaner)
    return safe or "UNKNOWN"


def build_filename(
    loaner_number: Optional[str],
    inspection_type: str,
    ext: str,
    suffix: str = "",
    index: int = 0,
) -> str:
    """
    Format: {LoanerNumber}_{InspectionType}_{YYYY-MM-DD}_{HHMMSS}[_suffix_NN].ext
    Examples:
        M498_checkout_2026-03-09_142312.mp4
        M498_checkin_2026-03-10_085101_damage_01.jpg
    """
    now = datetime.now(timezone.utc)
    date_s = now.strftime("%Y-%m-%d")
    time_s = now.strftime("%H%M%S")
    safe_ln = sanitize_loaner_number(loaner_number)
    safe_type = re.sub(r"[^A-Za-z0-9]", "", inspection_type.lower())
    base = f"{safe_ln}_{safe_type}_{date_s}_{time_s}"
    if suffix:
        safe_sfx = re.sub(r"[^A-Za-z0-9]", "_", suffix.lower())
        base += f"_{safe_sfx}_{index:02d}"
    return f"{base}.{ext.lstrip('.')}"


async def get_valid_access_token(db) -> Optional[str]:
    """
    Lazy token refresh — called at the moment a Drive route is invoked.
    Returns a valid access token or None if Drive is not configured.
    """
    try:
        from services.settings_service import (
            get_setting, set_setting,
            KEY_GOOGLE_ACCESS_TOKEN, KEY_GOOGLE_REFRESH_TOKEN, KEY_GOOGLE_TOKEN_EXPIRY,
        )
        from config import get_settings
        cfg = get_settings()

        access_token  = await get_setting(db, KEY_GOOGLE_ACCESS_TOKEN)
        refresh_token = await get_setting(db, KEY_GOOGLE_REFRESH_TOKEN)
        expiry_str    = await get_setting(db, KEY_GOOGLE_TOKEN_EXPIRY)

        if not access_token:
            return None

        expiry = None
        if expiry_str:
            try:
                expiry = datetime.fromisoformat(expiry_str)
                if expiry.tzinfo is None:
                    expiry = expiry.replace(tzinfo=timezone.utc)
            except ValueError:
                pass

        now = datetime.now(timezone.utc)
        near_expiry  = expiry is not None and (expiry - now) < timedelta(minutes=5)
        token_expired = expiry is not None and expiry <= now

        if token_expired and not refresh_token:
            logger.warning("Drive: token expired and no refresh_token — reconnect required")
            return None

        if refresh_token and (token_expired or near_expiry):
            import httpx
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    "https://oauth2.googleapis.com/token",
                    data={
                        "client_id":     cfg.google_client_id,
                        "client_secret": cfg.google_client_secret,
                        "refresh_token": refresh_token,
                        "grant_type":    "refresh_token",
                    },
                )
            if resp.status_code == 200:
                data = resp.json()
                access_token = data["access_token"]
                new_expiry   = now + timedelta(seconds=data.get("expires_in", 3600))
                await set_setting(db, KEY_GOOGLE_ACCESS_TOKEN, access_token)
                await set_setting(db, KEY_GOOGLE_TOKEN_EXPIRY, new_expiry.isoformat())
                if data.get("refresh_token"):
                    await set_setting(db, KEY_GOOGLE_REFRESH_TOKEN, data["refresh_token"])
                await db.commit()
                logger.info("Drive: token refreshed (lazy evaluation)")
            else:
                logger.error("Drive: token refresh failed %s: %s", resp.status_code, resp.text[:200])
                return None

        return access_token

    except Exception as exc:
        logger.error("Drive: get_valid_access_token error — %s", exc)
        return None


async def ensure_folders(db) -> dict:
    """Get or create Drive folder hierarchy. Cached in app_settings."""
    from services.settings_service import (
        get_setting, set_setting,
        KEY_DRIVE_ROOT_FOLDER_ID, KEY_DRIVE_INSP_FOLDER_ID,
        KEY_DRIVE_DMG_FOLDER_ID, KEY_DRIVE_FOLDER_NAME,
    )
    import httpx

    root_id = await get_setting(db, KEY_DRIVE_ROOT_FOLDER_ID)
    insp_id = await get_setting(db, KEY_DRIVE_INSP_FOLDER_ID)
    dmg_id  = await get_setting(db, KEY_DRIVE_DMG_FOLDER_ID)

    if root_id and insp_id and dmg_id:
        return {"root": root_id, "inspections": insp_id, "damage": dmg_id}

    token = await get_valid_access_token(db)
    if not token:
        raise RuntimeError("No valid Drive credentials")

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    async def find_or_create(name, parent_id=None):
        q = f"mimeType='application/vnd.google-apps.folder' and name='{name}' and trashed=false"
        if parent_id:
            q += f" and '{parent_id}' in parents"
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{DRIVE_API}/files",
                params={"q": q, "fields": "files(id)", "pageSize": 1},
                headers=headers,
            )
        files = r.json().get("files", [])
        if files:
            return files[0]["id"]
        body = {"name": name, "mimeType": "application/vnd.google-apps.folder"}
        if parent_id:
            body["parents"] = [parent_id]
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{DRIVE_API}/files",
                json=body,
                params={"fields": "id"},
                headers=headers,
            )
        fid = r.json()["id"]
        logger.info("Drive: created folder '%s' -> %s", name, fid)
        return fid

    root_id = await find_or_create(ROOT_FOLDER)
    insp_id = await find_or_create("inspections", root_id)
    dmg_id  = await find_or_create("damage", root_id)

    await set_setting(db, KEY_DRIVE_ROOT_FOLDER_ID, root_id)
    await set_setting(db, KEY_DRIVE_INSP_FOLDER_ID, insp_id)
    await set_setting(db, KEY_DRIVE_DMG_FOLDER_ID,  dmg_id)
    await set_setting(db, KEY_DRIVE_FOLDER_NAME,    ROOT_FOLDER)
    await db.commit()
    logger.info("Drive: folders ready — root=%s insp=%s dmg=%s", root_id, insp_id, dmg_id)

    return {"root": root_id, "inspections": insp_id, "damage": dmg_id}


async def create_resumable_upload_session(
    db,
    filename: str,
    mimetype: str,
    folder_hint: str = "inspections",
) -> str:
    """
    Request a Resumable Upload Session URL from the Drive API.
    The browser uses this URL to PUT the file directly — the backend
    never receives the media payload.

    Returns the upload session URI string.
    Raises RuntimeError if Drive is not connected.
    """
    import httpx
    import json

    token = await get_valid_access_token(db)
    if not token:
        raise RuntimeError("Google Drive is not connected")

    folders   = await ensure_folders(db)
    folder_id = folders.get(folder_hint, folders["inspections"])

    metadata = json.dumps({"name": filename, "parents": [folder_id]}).encode()

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{DRIVE_UPLOAD_API}/files",
            params={"uploadType": "resumable", "fields": "id,webViewLink"},
            headers={
                "Authorization":   f"Bearer {token}",
                "Content-Type":    "application/json; charset=UTF-8",
                "X-Upload-Content-Type": mimetype,
                "Content-Length":  str(len(metadata)),
            },
            content=metadata,
        )

    if resp.status_code not in (200, 201):
        raise RuntimeError(
            f"Drive resumable session failed {resp.status_code}: {resp.text[:200]}"
        )

    upload_uri = resp.headers.get("Location")
    if not upload_uri:
        raise RuntimeError("Drive did not return a Location header for the resumable session")

    logger.info("Drive: resumable session created for '%s' in folder %s", filename, folder_id)
    return upload_uri


async def set_file_public(db, file_id: str) -> None:
    """Grant anyone reader access to a Drive file."""
    import httpx
    token = await get_valid_access_token(db)
    if not token:
        return
    async with httpx.AsyncClient(timeout=15) as client:
        await client.post(
            f"{DRIVE_API}/files/{file_id}/permissions",
            json={"role": "reader", "type": "anyone"},
            headers={"Authorization": f"Bearer {token}"},
        )
