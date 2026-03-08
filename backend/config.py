"""
DealerSuite Loaner Inspection — Backend Configuration
Reads all settings from environment variables.
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_name: str = "DealerSuite Loaner Inspection"
    environment: str = "development"

    # Database
    database_url: str

    # Google Drive
    # For Railway / production: base64-encode your service_account.json and set this var.
    #   Linux/Mac:  base64 -w 0 service_account.json
    #   PowerShell: [Convert]::ToBase64String([IO.File]::ReadAllBytes("service_account.json"))
    google_service_account_json: str = ""
    # For local dev: path to the service account JSON file (used when the above is empty)
    google_service_account_file: str = "service_account.json"
    google_drive_root_folder_name: str = "DealerSuite Loaner Inspections"

    # JWT
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 480  # 8 hours for a full shift

    # CORS
    frontend_url: str = "http://localhost:5173"

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()
