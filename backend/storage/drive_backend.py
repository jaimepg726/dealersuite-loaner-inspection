"""DealerSuite - GoogleDriveBackend
OAuth-based Google Drive storage. Tokens stored in app_settings table (encrypted).
30-second upload timeout. One retry on failure. Falls back to LocalStorageBackend.
Folder IDs cached in app_settings - never recreated unless missing.
"""
import asyncio
import io
import logging
import re
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

from storage.base import StorageBackend, UploadResult

logger = logging.getLogger(__name__)

DRIVE_FILE_BASE = "https://drive.google.com/file/d/{}/view"
UPLOAD_TIMEOUT = 30
   # seconds
ROOT_FOLDER = "DealerSuite Loaner Inspections"


def sanitize_loaner_number(loaner: Optional[str]) -> str:
    """Keep only alphanumeric chars. Return 'UNKNOWN' if blank."""
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


class GoogleDriveBackend(StorageBackend):
    """
    Uses OAuth tokens stored in the database settings table.
    Uses httpx for all Google Drive API calls to avoid google-auth
    internal datetime comparison issues.
    """

    DRIVE_API = "https://www.googleapis.com/drive/v3"
    DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3"

    def __init__(self, db_session):
        self._db = db_session

    @property
    def backend_name(self) -> str:
        return "drive"

    async def _get_access_token(self) -> str | None:
        """Get a valid access token, refreshing if needed. Returns None if unavailable."""
        try:
            from services.settings_service import (
                get_setting, set_setting,
                KEY_GOOGLE_ACCESS_TOKEN, KEY_GOOGLE_REFRESH_TOKEN, KEY_GOOGLE_TOKEN_EXPIRY,
            )
            from config import get_settings
            cfg = get_settings()

            access_token = await get_setting(self._db, KEY_GOOGLE_ACCESS_TOKEN)
            refresh_token = await get_setting(self._db, KEY_GOOGLE_REFRESH_TOKEN)
            expiry_str = await get_setting(self._db, KEY_GOOGLE_TOKEN_EXPIRY)

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
            near_expiry = expiry is not None and (expiry - now) < timedelta(minutes=5)
            token_expired = expiry is not None and expiry <= now

            if token_expired and not refresh_token:
                logger.warning("Drive: token expired and no refresh_token")
                return None

            # Refresh using httpx if needed
            if refresh_token and (token_expired or near_expiry):
                import httpx as _httpx
                async with _httpx.AsyncClient() as client:
                    resp = await client.post(
                        "https://oauth2.googleapis.com/token",
                        data={
                            "client_id": cfg.google_client_id,
                            "client_secret": cfg.google_client_secret,
                            "refresh_token": refresh_token,
                            "grant_type": "refresh_token",
                        },
                    )
                if resp.status_code == 200:
                    data = resp.json()
                    access_token = data["access_token"]
                    new_expiry = now + timedelta(seconds=data.get("expires_in", 3600))
                    await set_setting(self._db, KEY_GOOGLE_ACCESS_TOKEN, access_token)
                    await set_setting(self._db, KEY_GOOGLE_TOKEN_EXPIRY, new_expiry.isoformat())
                    if data.get("refresh_token"):
                        await set_setting(self._db, KEY_GOOGLE_REFRESH_TOKEN, data["refresh_token"])
                    await self._db.commit()
                    logger.info("Drive: token refreshed via httpx")
                else:
                    logger.error("Drive: token refresh failed: %s", resp.text)
                    return None

            return access_token
        except Exception as exc:
            logger.error("Drive: _get_access_token error - %s", exc)
            return None

    # Keep _get_credentials for backward compatibility with google_test endpoint
    async def _get_credentials(self):
        """Returns a minimal object with .token attribute for compatibility."""
        token = await self._get_access_token()
        if not token:
            return None
        class _FakeCreds:
            def __init__(self, t): self.token = t
        return _FakeCreds(token)

    async def is_available(self) -> bool:
        return (await self._get_access_token()) is not None

    async def _ensure_folders(self) -> dict:
        """Get or create Drive folder hierarchy using httpx."""
        from services.settings_service import (
            get_setting, set_setting,
            KEY_DRIVE_ROOT_FOLDER_ID, KEY_DRIVE_INSP_FOLDER_ID,
            KEY_DRIVE_DMG_FOLDER_ID, KEY_DRIVE_FOLDER_NAME,
        )
        import httpx

        root_id = await get_setting(self._db, KEY_DRIVE_ROOT_FOLDER_ID)
        insp_id = await get_setting(self._db, KEY_DRIVE_INSP_FOLDER_ID)
        dmg_id = await get_setting(self._db, KEY_DRIVE_DMG_FOLDER_ID)

        if root_id and insp_id and dmg_id:
            return {"root": root_id, "inspections": insp_id, "damage": dmg_id}

        token = await self._get_access_token()
        if not token:
            raise RuntimeError("No valid Drive credentials")

        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        async def find_or_create(name, parent_id=None):
            q = f"mimeType='application/vnd.google-apps.folder' and name='{name}' and trashed=false"
            if parent_id:
                q += f" and '{parent_id}' in parents"
            async with httpx.AsyncClient() as client:
                r = await client.get(
                    f"{self.DRIVE_API}/files",
                    params={"q": q, "fields": "files(id)", "pageSize": 1},
                    headers=headers,
                )
            files = r.json().get("files", [])
            if files:
                return files[0]["id"]
            body = {"name": name, "mimeType": "application/vnd.google-apps.folder"}
            if parent_id:
                body["parents"] = [parent_id]
            async with httpx.AsyncClient() as client:
                r = await client.post(
                    f"{self.DRIVE_API}/files",
                    json=body,
                    params={"fields": "id"},
                    headers=headers,
                )
            fid = r.json()["id"]
            logger.info("Drive: created folder '%s' -> %s", name, fid)
            return fid

        root_id = await find_or_create(ROOT_FOLDER)
        insp_id = await find_or_create("inspections", root_id)
        dmg_id = await find_or_create("damage", root_id)

        await set_setting(self._db, KEY_DRIVE_ROOT_FOLDER_ID, root_id)
        await set_setting(self._db, KEY_DRIVE_INSP_FOLDER_ID, insp_id)
        await set_setting(self._db, KEY_DRIVE_DMG_FOLDER_ID, dmg_id)
        await set_setting(self._db, KEY_DRIVE_FOLDER_NAME, ROOT_FOLDER)
        await self._db.commit()
        logger.info("Drive: folders ready — root=%s insp=%s dmg=%s", root_id, insp_id, dmg_id)

        return {"root": root_id, "inspections": insp_id, "damage": dmg_id}

    def _build_service(self, creds):
        from googleapiclient.discovery import build
        return build("drive", "v3", credentials=creds, cache_discovery=False)

    async def upload_file(
        self,
        content: bytes,
        filename: str,
        mimetype: str,
        folder_hint: str = "inspections",
    ) -> UploadResult:
        import httpx
        try:
            folders = await self._ensure_folders()
            folder_id = folders.get(folder_hint, folders["inspections"])
            token = await self._get_access_token()
            if not token:
                raise RuntimeError("No valid Drive credentials")

            headers_auth = {"Authorization": f"Bearer {token}"}

            async def _do_upload():
                # Multipart upload
                import json as _json
                boundary = f"boundary_{secrets.token_hex(8)}"
                meta = _json.dumps({"name": filename, "parents": [folder_id]}).encode()
                body = (
                    f"--{boundary}\r\n".encode() +
                    b"Content-Type: application/json; charset=UTF-8\r\n\r\n" +
                    meta + b"\r\n" +
                    f"--{boundary}\r\n".encode() +
                    f"Content-Type: {mimetype}\r\n\r\n".encode() +
                    content + b"\r\n" +
                    f"--{boundary}--".encode()
                )
                async with httpx.AsyncClient(timeout=UPLOAD_TIMEOUT) as client:
                    r = await client.post(
                        f"{self.DRIVE_UPLOAD_API}/files",
                        params={"uploadType": "multipart", "fields": "id"},
                        content=body,
                        headers={
                            **headers_auth,
                            "Content-Type": f"multipart/related; boundary={boundary}",
                        },
                    )
                if r.status_code not in (200, 201):
                    raise RuntimeError(f"Upload failed {r.status_code}: {r.text[:200]}")
                fid = r.json()["id"]
                # Make public
                async with httpx.AsyncClient(timeout=10) as client:
                    await client.post(
                        f"{self.DRIVE_API}/files/{fid}/permissions",
                        json={"role": "reader", "type": "anyone"},
                        headers=headers_auth,
                    )
                return fid

            for attempt in range(2):
                try:
                    file_id = await _do_upload()
                    file_url = DRIVE_FILE_BASE.format(file_id)
                    logger.info("Drive: uploaded '%s' -> %s", filename, file_id)
                    return UploadResult(
                        file_id=file_id, file_url=file_url, backend="drive",
                        filename=filename, success=True,
                    )
                except Exception as exc:
                    logger.warning("Drive: upload attempt %d failed - %s", attempt + 1, exc)
                    if attempt == 0:
                        await asyncio.sleep(1)

            raise RuntimeError("Drive upload failed after 2 attempts")

        except Exception as exc:
            logger.error("Drive: upload failed for '%s' - %s; falling back to local", filename, exc)
            from storage.local_backend import LocalStorageBackend
            return await LocalStorageBackend().upload_file(content, filename, mimetype, folder_hint)
