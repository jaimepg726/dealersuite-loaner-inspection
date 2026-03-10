"""DealerSuite Loaner Inspection - Backend Configuration"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_name: str = "DealerSuite Loaner Inspection"
    environment: str = "development"

    # Database
    database_url: str

    # Google OAuth (Batch 3 - user OAuth flow)
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/auth/google/callback"

    # Google Drive (legacy service account - kept for fallback compatibility)
    google_service_account_json: str = ""
    google_service_account_file: str = "service_account.json"
    google_drive_root_folder_name: str = "DealerSuite Loaner Inspections"

    # JWT
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 480

    # CORS
    frontend_url: str = "http://localhost:5173"

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()
