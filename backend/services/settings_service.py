"""DealerSuite - Settings Service
Encrypted key/value store backed by app_settings table.
Encryption uses Fernet (AES-128-CBC) with a key derived from jwt_secret.
"""
import base64
import hashlib
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Known setting keys
KEY_GOOGLE_ACCESS_TOKEN  = "google_access_token"
KEY_GOOGLE_REFRESH_TOKEN = "google_refresh_token"
KEY_GOOGLE_TOKEN_EXPIRY  = "google_token_expiry"
KEY_GOOGLE_ACCOUNT_EMAIL = "google_account_email"
KEY_DRIVE_ROOT_FOLDER_ID = "drive_root_folder_id"
KEY_DRIVE_INSP_FOLDER_ID = "drive_inspections_folder_id"
KEY_DRIVE_DMG_FOLDER_ID  = "drive_damage_folder_id"
KEY_DRIVE_FOLDER_NAME    = "drive_root_folder_name"
KEY_OAUTH_STATE          = "oauth_csrf_state"


def _get_fernet():
    from cryptography.fernet import Fernet
    from config import get_settings
    secret = get_settings().jwt_secret.encode()
    key32 = hashlib.sha256(secret).digest()
    fernet_key = base64.urlsafe_b64encode(key32)
    return Fernet(fernet_key)


def encrypt_value(plaintext: str) -> str:
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str) -> str:
    return _get_fernet().decrypt(ciphertext.encode()).decode()


async def get_setting(db: AsyncSession, key: str) -> str | None:
    from models.settings import AppSettings
    result = await db.execute(select(AppSettings).where(AppSettings.key == key))
    row = result.scalar_one_or_none()
    if row is None or row.value is None:
        return None
    try:
        return decrypt_value(row.value)
    except Exception:
        logger.warning("settings: could not decrypt key=%s - returning None", key)
        return None


async def set_setting(db: AsyncSession, key: str, value: str | None) -> None:
    from models.settings import AppSettings
    from datetime import datetime, timezone
    result = await db.execute(select(AppSettings).where(AppSettings.key == key))
    row = result.scalar_one_or_none()
    encrypted = encrypt_value(value) if value is not None else None
    if row is None:
        row = AppSettings(key=key, value=encrypted)
        db.add(row)
    else:
        row.value = encrypted
        row.updated_at = datetime.now(timezone.utc)
    await db.flush()


async def delete_setting(db: AsyncSession, key: str) -> None:
    from models.settings import AppSettings
    result = await db.execute(select(AppSettings).where(AppSettings.key == key))
    row = result.scalar_one_or_none()
    if row:
        await db.delete(row)
        await db.flush()


async def get_all_drive_settings(db: AsyncSession) -> dict:
    keys = [
        KEY_GOOGLE_ACCOUNT_EMAIL,
        KEY_DRIVE_ROOT_FOLDER_ID,
        KEY_DRIVE_INSP_FOLDER_ID,
        KEY_DRIVE_DMG_FOLDER_ID,
        KEY_DRIVE_FOLDER_NAME,
        KEY_GOOGLE_TOKEN_EXPIRY,
    ]
    result = {}
    for k in keys:
        result[k] = await get_setting(db, k)
    return result
