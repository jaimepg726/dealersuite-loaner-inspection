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
    Requires the database session to be injected at construction.
    """

    def __init__(self, db_session):
        self._db = db_session

    @property
    def backend_name(self) -> str:
        return "drive"

    async def is_available(self) -> bool:
        try:
            creds = await self._get_credentials()
            return creds is not None
        except Exception:
            return False

    async def _get_credentials(self):
        """Build google.oauth2.credentials.Credentials from stored tokens.

        Wraps everything in try/except so any unexpected error (e.g. a
        timezone comparison crash) returns None instead of propagating.
        """
        try:
            from services.settings_service import (
                get_setting,
                set_setting,
                KEY_GOOGLE_ACCESS_TOKEN,
                KEY_GOOGLE_REFRESH_TOKEN,
                KEY_GOOGLE_TOKEN_EXPIRY,
            )
            from config import get_settings
            cfg = get_settings()

            access_token = await get_setting(self._db, KEY_GOOGLE_ACCESS_TOKEN)
            refresh_token = await get_setting(self._db, KEY_GOOGLE_REFRESH_TOKEN)
            expiry_str = await get_setting(self._db, KEY_GOOGLE_TOKEN_EXPIRY)

            if not access_token:
                return None

            # Google sometimes omits refresh_token on re-auth.
            # Check if access token is still valid before blocking.
            _exp_check = None
            if expiry_str:
                try:
                    _exp_check = datetime.fromisoformat(expiry_str)
                    if _exp_check.tzinfo is None:
                        _exp_check = _exp_check.replace(tzinfo=timezone.utc)
                except ValueError:
                    pass
            _tok_expired = _exp_check is not None and _exp_check <= datetime.now(timezone.utc)
            if _tok_expired and not refresh_token:
                logger.warning("Drive: token expired and no refresh_token")
                return None

            from google.oauth2.credentials import Credentials
            from google.auth.transport.requests import Request as GoogleRequest

            expiry = None
            if expiry_str:
                try:
                    expiry = datetime.fromisoformat(expiry_str)
                except ValueError:
                    pass

            creds = Credentials(
                token=access_token,
                refresh_token=refresh_token,
                token_uri="https://oauth2.googleapis.com/token",
                client_id=cfg.google_client_id,
                client_secret=cfg.google_client_secret,
                expiry=expiry,
            )

            # Patch naive expiry datetimes to UTC-aware so google-auth's
            # creds.expired check never raises "can't compare offset-naive
            # and offset-aware datetimes".
            if creds.expiry and creds.expiry.tzinfo is None:
                creds.expiry = creds.expiry.replace(tzinfo=timezone.utc)
            if expiry and expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)

            # Refresh if expired (or nearly) — only when refresh_token is available
            if refresh_token and (creds.expired or (
                expiry and expiry - datetime.now(timezone.utc) < timedelta(minutes=5)
            ):
                try:
                    loop = asyncio.get_event_loop()
                    await loop.run_in_executor(
                        None, lambda: creds.refresh(GoogleRequest())
                    )
                    await set_setting(self._db, KEY_GOOGLE_ACCESS_TOKEN, creds.token)
                    if creds.refresh_token:
                        # google-auth occasionally rotates the refresh token;
                        # persist the new one so we never lose offline access.
                        await set_setting(self._db, KEY_GOOGLE_REFRESH_TOKEN, creds.refresh_token)
                    if creds.expiry:
                        await set_setting(
                            self._db,
                            KEY_GOOGLE_TOKEN_EXPIRY,
                            creds.expiry.isoformat(),
                        )
                    await self._db.commit()
                    logger.info("Drive: access token refreshed successfully")
                except Exception as exc:
                    logger.error("Drive: token refresh failed - %s", exc)
                    return None

            return creds
        except Exception as exc:
            logger.error("Drive: _get_credentials unexpected error - %s", exc)
            return None

    def _build_service(self, creds):
        from googleapiclient.discovery import build
        return build("drive", "v3", credentials=creds, cache_discovery=False)

    async def _ensure_folders(self) -> dict:
        """
        Return folder IDs from settings. Create them once if missing.
        Returns dict with keys: root, inspections, damage
        """
        from services.settings_service import (
            get_setting,
            set_setting,
            KEY_DRIVE_ROOT_FOLDER_ID,
            KEY_DRIVE_INSP_FOLDER_ID,
            KEY_DRIVE_DMG_FOLDER_ID,
            KEY_DRIVE_FOLDER_NAME,
            KEY_GOOGLE_ACCOUNT_EMAIL,
        )

        root_id = await get_setting(self._db, KEY_DRIVE_ROOT_FOLDER_ID)
        insp_id = await get_setting(self._db, KEY_DRIVE_INSP_FOLDER_ID)
        dmg_id = await get_setting(self._db, KEY_DRIVE_DMG_FOLDER_ID)

        if root_id and insp_id and dmg_id:
            return {"root": root_id, "inspections": insp_id, "damage": dmg_id}

        # Need to create folders
        creds = await self._get_credentials()
        if not creds:
            raise RuntimeError("No valid Drive credentials")

        loop = asyncio.get_event_loop()
        service = await loop.run_in_executor(None, lambda: self._build_service(creds))

        def _create_folders():
            def find_or_create(name, parent_id=None):
                q_parts = [
                    "mimeType = 'application/vnd.google-apps.folder'",
                    f"name = '{name}'",
                    "trashed = false",
                ]
                if parent_id:
                    q_parts.append(f"'{parent_id}' in parents")
                resp = service.files().list(
                    q=" and ".join(q_parts),
                    spaces="drive",
                    fields="files(id)",
                    pageSize=1,
                ).execute()
                files = resp.get("files", [])
                if files:
                    return files[0]["id"]
                meta = {"name": name, "mimeType": "application/vnd.google-apps.folder"}
                if parent_id:
                    meta["parents"] = [parent_id]
                folder = service.files().create(body=meta, fields="id").execute()
                fid = folder["id"]
                logger.info("Drive: created folder '%s' -> %s", name, fid)
                return fid

            r_id = find_or_create(ROOT_FOLDER)
            i_id = find_or_create("inspections", r_id)
            d_id = find_or_create("damage", r_id)
            return r_id, i_id, d_id

        root_id, insp_id, dmg_id = await loop.run_in_executor(None, _create_folders)

        # Persist folder IDs
        await set_setting(self._db, KEY_DRIVE_ROOT_FOLDER_ID, root_id)
        await set_setting(self._db, KEY_DRIVE_INSP_FOLDER_ID, insp_id)
        await set_setting(self._db, KEY_DRIVE_DMG_FOLDER_ID, dmg_id)
        await set_setting(self._db, KEY_DRIVE_FOLDER_NAME, ROOT_FOLDER)

        try:
            email = await get_setting(self._db, KEY_GOOGLE_ACCOUNT_EMAIL)
            logger.info(
                "Drive CONNECTED: account=%s root_folder_id=%s",
                email,
                root_id,
            )
        except Exception:
            pass

        await self._db.commit()
        return {"root": root_id, "inspections": insp_id, "damage": dmg_id}

    async def upload_file(
        self,
        content: bytes,
        filename: str,
        mimetype: str,
        folder_hint: str = "inspections",
    ) -> UploadResult:
        try:
            folders = await self._ensure_folders()
            folder_id = folders.get(folder_hint, folders["inspections"])
            creds = await self._get_credentials()
            if not creds:
                raise RuntimeError("No valid Drive credentials")

            loop = asyncio.get_event_loop()
            service = await loop.run_in_executor(None, lambda: self._build_service(creds))

            def _upload():
                from googleapiclient.http import MediaIoBaseUpload
                meta = {"name": filename, "parents": [folder_id]}
                media = MediaIoBaseUpload(
                    io.BytesIO(content), mimetype=mimetype, resumable=True
                )
                f = service.files().create(
                    body=meta, media_body=media, fields="id"
                ).execute()
                fid = f["id"]
                service.permissions().create(
                    fileId=fid,
                    body={"role": "reader", "type": "anyone"},
                ).execute()
                return fid

            # 30-second timeout, one retry
            for attempt in range(2):
                try:
                    file_id = await asyncio.wait_for(
                        loop.run_in_executor(None, _upload),
                        timeout=UPLOAD_TIMEOUT,
                    )
                    file_url = DRIVE_FILE_BASE.format(file_id)
                    logger.info("Drive: uploaded '%s' -> %s", filename, file_id)
                    return UploadResult(
                        file_id=file_id,
                        file_url=file_url,
                        backend="drive",
                        filename=filename,
                        success=True,
                    )
                except asyncio.TimeoutError:
                    logger.warning(
                        "Drive: upload timeout attempt %d for %s",
                        attempt + 1,
                        filename,
                    )
                except Exception as exc:
                    logger.warning(
                        "Drive: upload error attempt %d - %s", attempt + 1, exc
                    )
                    if attempt == 0:
                        await asyncio.sleep(1)

            raise RuntimeError("Drive upload failed after 2 attempts")

        except Exception as exc:
            logger.error(
                "Drive: upload failed for '%s' - %s; falling back to local",
                filename,
                exc,
            )
            from storage.local_backend import LocalStorageBackend
            return await LocalStorageBackend().upload_file(
                content, filename, mimetype, folder_hint
            )
