"""DealerSuite - StorageBackend abstract interface
All upload flows must go through this abstraction.
Neither inspection_service nor inspect routes should call Drive directly.
"""
import abc
from dataclasses import dataclass
from typing import Optional


@dataclass
class UploadResult:
    file_id: Optional[str]
    file_url: Optional[str]
    backend: str          # "drive" or "local"
    filename: str
    success: bool
    error: Optional[str] = None


class StorageBackend(abc.ABC):

    @abc.abstractmethod
    async def upload_file(
        self,
        content: bytes,
        filename: str,
        mimetype: str,
        folder_hint: str = "inspections",
    ) -> UploadResult:
        """Upload bytes and return an UploadResult."""
        ...

    @abc.abstractmethod
    async def is_available(self) -> bool:
        """Quick health check - returns True if this backend is usable."""
        ...

    @property
    @abc.abstractmethod
    def backend_name(self) -> str:
        ...
