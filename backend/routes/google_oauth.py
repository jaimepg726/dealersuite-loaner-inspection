"""DealerSuite - Google OAuth Routes
GET  /api/auth/google/connect   -> redirect to Google consent
GET  /api/auth/google/callback  -> handle token exchange
GET  /api/auth/google/status    -> connection info for Settings UI
GET  /api/auth/google/test      -> verify token refresh + Drive access
DELETE /api/auth/google/revoke  -> disconnect Drive
"""
import logging
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user, require_manager
from services.auth_service import decode_access_token
from services.settings_service import (
    get_setting, set_setting, delete_setting,
    KEY_GOOGLE_ACCESS_TOKEN,
    KEY_GOOGLE_REFRESH_TOKEN,
    KEY_GOOGLE_TOKEN_EXPIRY,
    KEY_GOOGLE_ACCOUNT_EMAIL,
    KEY_DRIVE_ROOT_FOLDER_ID,
    KEY_DRIVE_INSP_FOLDER_ID,
    KEY_DRIVE_DMG_FOLDER_ID,
    KEY_DRIVE_FOLDER_NAME,
    KEY_OAUTH_STATE,
)

logger = logging.getLogger(__name__)
router = APIRouter()

SCOPES = "https://www.googleapis.com/auth/drive.file"


def _oauth_client():
    from config import get_settings
    cfg = get_settings()
    if not cfg.google_client_id or not cfg.google_client_secret:
        raise HTTPException(
            status_code=503,
            detail="Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
        )
    return cfg


# GET /api/auth/google/connect
@router.get("/connect", summary="Start Google OAuth flow (any authenticated user)")
async def google_connect(
    db: AsyncSession = Depends(get_db),
    token: str = Query(None),
):
    # Verify the JWT passed as ?token= (browser navigation can't send headers)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        raise HTTPException(status_code=401, detail="Invalid token")
    from models.user import User
    result = await db.execute(select(User).where(User.id == int(payload["sub"])))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=401, detail="User not found")
    cfg = _oauth_client()
    state = secrets.token_urlsafe(32)
    await set_setting(db, KEY_OAUTH_STATE, state)
    await db.commit()

    params = "&".join([
        f"client_id={cfg.google_client_id}",
        f"redirect_uri={cfg.google_redirect_uri}",
        "response_type=code",
        f"scope={SCOPES}",
        "access_type=offline",
        "prompt=consent",
        "include_granted_scopes=true",
        f"state={state}",
    ])
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{params}"
    return RedirectResponse(url=auth_url)


# GET /api/auth/google/callback
@router.get("/callback", summary="OAuth callback - exchange code for tokens")
async def google_callback(
    code: str,
    state: str,
    db: AsyncSession = Depends(get_db),
):
    cfg = _oauth_client()

    # CSRF check
    stored_state = await get_setting(db, KEY_OAUTH_STATE)
    if not stored_state or stored_state != state:
        raise HTTPException(status_code=400, detail="Invalid OAuth state - possible CSRF")
    await delete_setting(db, KEY_OAUTH_STATE)

    # Exchange code for tokens
    import httpx
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": cfg.google_client_id,
                "client_secret": cfg.google_client_secret,
                "redirect_uri": cfg.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
    if resp.status_code != 200:
        logger.error("OAuth token exchange failed: %s", resp.text)
        raise HTTPException(status_code=400, detail="Failed to exchange authorization code")

    token_data = resp.json()
    access_token  = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")
    expires_in    = token_data.get("expires_in", 3600)

    if not access_token:
        raise HTTPException(status_code=400, detail="No access token in response")

    expiry = datetime.now(timezone.utc).replace(microsecond=0)
    from datetime import timedelta
    expiry = expiry + timedelta(seconds=expires_in)

    # Fetch account email
    async with httpx.AsyncClient() as client:
        info_resp = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    email = info_resp.json().get("email", "unknown") if info_resp.status_code == 200 else "unknown"

    # Store tokens encrypted.
    # Google only sends refresh_token on the very first consent grant; subsequent
    # re-authorisations omit it.  Keep the existing one if no new one arrives.
    await set_setting(db, KEY_GOOGLE_ACCESS_TOKEN, access_token)
    existing_refresh = await get_setting(db, KEY_GOOGLE_REFRESH_TOKEN)
    if refresh_token:
        await set_setting(db, KEY_GOOGLE_REFRESH_TOKEN, refresh_token)
    elif not existing_refresh:
        # No refresh token in DB and Google didn't send one â offline access is
        # impossible.  Surface this as an error so the user knows to reconnect.
        from config import get_settings as _gs
        _frontend = _gs().frontend_url
        return RedirectResponse(
            url=f"{_frontend}/dashboard/settings?drive=error&reason=no_refresh_token"
        )
    await set_setting(db, KEY_GOOGLE_TOKEN_EXPIRY, expiry.isoformat())
    await set_setting(db, KEY_GOOGLE_ACCOUNT_EMAIL, email)

    # Clear cached folder IDs so they get recreated with new credentials
    await delete_setting(db, KEY_DRIVE_ROOT_FOLDER_ID)
    await delete_setting(db, KEY_DRIVE_INSP_FOLDER_ID)
    await delete_setting(db, KEY_DRIVE_DMG_FOLDER_ID)

    await db.commit()

    logger.info("Drive OAuth callback: email=%s new_refresh=%s", email, bool(refresh_token))

    # Redirect to settings page
    from config import get_settings
    frontend = get_settings().frontend_url
    return RedirectResponse(url=f"{frontend}/dashboard/settings?drive=connected")


# GET /api/auth/google/status
@router.get("/status", summary="Drive connection status")
async def google_status(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    access_token = await get_setting(db, KEY_GOOGLE_ACCESS_TOKEN)
    email        = await get_setting(db, KEY_GOOGLE_ACCOUNT_EMAIL)
    folder_name  = await get_setting(db, KEY_DRIVE_FOLDER_NAME)
    root_id      = await get_setting(db, KEY_DRIVE_ROOT_FOLDER_ID)
    expiry_str   = await get_setting(db, KEY_GOOGLE_TOKEN_EXPIRY)

    connected = bool(access_token)
    expiry_dt = None
    if expiry_str:
        try:
            expiry_dt = datetime.fromisoformat(expiry_str)
        except ValueError:
            pass

    return {
        "connected": connected,
        "email": email,
        "folder_name": folder_name or "DealerSuite Loaner Inspections",
        "root_folder_id": root_id,
        "token_expires_at": expiry_str,
        "token_expired": expiry_dt is not None and expiry_dt < datetime.now(timezone.utc),
        "storage_mode": "drive" if connected else "local",
    }


# GET /api/auth/google/test
@router.get("/test", summary="Test Drive connection health")
async def google_test(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_manager),
):
    from storage.drive_backend import GoogleDriveBackend
    import httpx

    drive = GoogleDriveBackend(db)

    # Test credentials build
    creds = await drive._get_credentials()
    if not creds:
        return {
            "healthy": False,
            "token_refresh": False,
            "drive_access": False,
            "error": "No valid credentials - please reconnect Google Drive",
        }

    # Use httpx directly to test Drive API — avoids google-auth internal datetime bugs
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://www.googleapis.com/drive/v3/about",
                params={"fields": "user"},
                headers={"Authorization": f"Bearer {creds.token}"},
                timeout=10,
            )
        if resp.status_code == 200:
            drive_email = resp.json().get("user", {}).get("emailAddress", "unknown")
            return {
                "healthy": True,
                "token_refresh": True,
                "drive_access": True,
                "drive_account": drive_email,
            }
        elif resp.status_code == 401:
            return {
                "healthy": False,
                "token_refresh": True,
                "drive_access": False,
                "error": "Access token expired — please reconnect Google Drive to get a fresh token",
            }
        else:
            return {
                "healthy": False,
                "token_refresh": True,
                "drive_access": False,
                "error": f"Drive API error {resp.status_code}",
            }
    except Exception as exc:
        return {
            "healthy": False,
            "token_refresh": True,
            "drive_access": False,
            "error": str(exc),
        }


# DELETE /api/auth/google/revoke
@router.delete("/revoke", summary="Disconnect Google Drive (manager only)")
async def google_revoke(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_manager),
):
    access_token = await get_setting(db, KEY_GOOGLE_ACCESS_TOKEN)

    # Revoke at Google
    if access_token:
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                await client.post(
                    "https://oauth2.googleapis.com/revoke",
                    params={"token": access_token},
                )
        except Exception as exc:
            logger.warning("Drive: token revoke request failed - %s", exc)

    # Clear all stored Drive data
    for key in [
        KEY_GOOGLE_ACCESS_TOKEN,
        KEY_GOOGLE_REFRESH_TOKEN,
        KEY_GOOGLE_TOKEN_EXPIRY,
        KEY_GOOGLE_ACCOUNT_EMAIL,
        KEY_DRIVE_ROOT_FOLDER_ID,
        KEY_DRIVE_INSP_FOLDER_ID,
        KEY_DRIVE_DMG_FOLDER_ID,
        KEY_DRIVE_FOLDER_NAME,
    ]:
        await delete_setting(db, key)

    await db.commit()
    logger.info("Drive: disconnected by %s", current_user.email)
    return {"message": "Google Drive disconnected"}
