"""DealerSuite - LocalStorageBackend
Saves files to the local filesystem under /tmp/dealersuite_uploads/
Used as fallback when Google Drive is unavailable.
Inspections NEVER fail because of this backend - it always succeeds.
"""
import logging
import os
from pathlib import Path

from storage.base import StorageBackend, UploadResult

logger = logging.getLogger(__name__)

UPLOAD_DIR = Path("/tmp/dealersuite_uploads")


class LocalStorageBackend(StorageBackend):

    @property
    def backend_name(self) -> str:
        return "local"

    async def is_available(self) -> bool:
        try:
            UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
            return True
        except Exception:
            return False

    async def upload_file(
        self,
        content: bytes,
        filename: str,
        mimetype: str,
        folder_hint: str = "inspections",
    ) -> UploadResult:
        try:
            dest_dir = UPLOAD_DIR / folder_hint
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest_path = dest_dir / filename
            dest_path.write_bytes(content)
            logger.info("LocalStorage: saved %s (%d bytes)", dest_path, len(content))
            return UploadResult(
                file_id=str(dest_path),
                file_url=None,
                backend="local",
                filename=filename,
                success=True,
            )
        except Exception as exc:
            logger.error("LocalStorage: write failed - %s", exc)
            return UploadResult(
                file_id=None,
                file_url=None,
                backend="local",
                filename=filename,
                success=False,
                error=str(exc),
            )
