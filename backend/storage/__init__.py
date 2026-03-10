"""DealerSuite - Storage package
Factory function returns the best available backend.
All upload flows use get_storage_backend() - never call Drive directly.
"""
from storage.base import StorageBackend, UploadResult
from storage.local_backend import LocalStorageBackend
from storage.drive_backend import GoogleDriveBackend, build_filename, sanitize_loaner_number


async def get_storage_backend(db_session=None) -> StorageBackend:
    """
    Return GoogleDriveBackend if OAuth tokens are configured and valid.
    Fall back to LocalStorageBackend if Drive is unavailable.
    """
    if db_session is not None:
        drive = GoogleDriveBackend(db_session)
        if await drive.is_available():
            return drive
    return LocalStorageBackend()


__all__ = [
    "StorageBackend",
    "UploadResult",
    "LocalStorageBackend",
    "GoogleDriveBackend",
    "get_storage_backend",
    "build_filename",
    "sanitize_loaner_number",
]
