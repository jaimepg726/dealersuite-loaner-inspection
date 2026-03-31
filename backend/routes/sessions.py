"""DealerSuite — Video Session Tracking Routes

POST  /api/sessions/               → create session (any auth)
PATCH /api/sessions/{uuid}         → update session  (any auth, owner check)
POST  /api/sessions/{uuid}/heartbeat → heartbeat     (any auth)
POST  /api/sessions/{uuid}/beacon    → unload beacon (token query param — supports keepalive fetch)

All mutating routes are intentionally lenient: a missing session returns ok=False
rather than 404 so network hiccups during app teardown don't produce noisy errors.
"""

import uuid as _uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from dependencies import get_current_user
from models.video_session import VideoSession
from schemas.video_session import VideoSessionCreate, VideoSessionUpdate, HeartbeatBody

router = APIRouter()

# Statuses that should never be overwritten by a later update
_TERMINAL = frozenset({
    "completed", "failed_upload", "abandoned",
    "closed_early", "interrupted", "expired",
})


async def _get(db: AsyncSession, session_uuid: str) -> VideoSession | None:
    result = await db.execute(
        select(VideoSession).where(VideoSession.uuid == session_uuid)
    )
    return result.scalar_one_or_none()


# ── Create ─────────────────────────────────────────────────────────────────────

@router.post("/", status_code=201, summary="Create a video session")
async def create_session(
    data: VideoSessionCreate,
    db:   AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    session = VideoSession(
        uuid             = str(_uuid.uuid4()),
        inspector_id     = current_user.id,
        inspector_name   = data.inspector_name or current_user.name,
        loaner_number    = data.loaner_number,
        inspection_type  = data.inspection_type,
        inspection_id    = data.inspection_id,
        min_duration_required = data.min_duration_required,
        status           = "started",
    )
    db.add(session)
    await db.commit()
    return {"uuid": session.uuid, "id": session.id}


# ── Update ─────────────────────────────────────────────────────────────────────

@router.patch("/{session_uuid}", status_code=200, summary="Update session phase or status")
async def update_session(
    session_uuid: str,
    data: VideoSessionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    session = await _get(db, session_uuid)
    if session is None:
        return {"ok": False, "reason": "not_found"}

    # Only the session owner or a manager/admin may update
    if (session.inspector_id != current_user.id
            and current_user.role not in ("manager", "admin")):
        raise HTTPException(status_code=403, detail="Not authorized")

    _apply_update(session, data)
    session.last_heartbeat_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


# ── Heartbeat ─────────────────────────────────────────────────────────────────

@router.post("/{session_uuid}/heartbeat", status_code=200, summary="Keep session alive")
async def heartbeat(
    session_uuid: str,
    data: HeartbeatBody,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    session = await _get(db, session_uuid)
    if session is None:
        return {"ok": False, "reason": "not_found"}

    now = datetime.now(timezone.utc)
    session.last_heartbeat_at = now
    if data.phase:
        session.last_known_phase = data.phase
    await db.commit()
    return {"ok": True}


# ── Beacon (keepalive-safe) ────────────────────────────────────────────────────

@router.post("/{session_uuid}/beacon", status_code=200,
             summary="Unload beacon — uses ?token= auth for keepalive compatibility")
async def beacon(
    session_uuid: str,
    data: VideoSessionUpdate,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Called via fetch({keepalive: true}) on pagehide / visibilitychange.
    Uses ?token= query param because keepalive fetch must include auth info
    in the body or URL (Authorization header may be stripped by some browsers).
    """
    from jose import JWTError, jwt
    from config import get_settings
    cfg = get_settings()
    try:
        payload  = jwt.decode(token, cfg.jwt_secret, algorithms=[cfg.jwt_algorithm])
        user_id  = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    session = await _get(db, session_uuid)
    if session is None:
        return {"ok": False}

    # Ownership check — only the originating user's beacon is accepted
    if session.inspector_id != user_id:
        return {"ok": False}

    _apply_update(session, data)
    session.last_heartbeat_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


# ── Shared update helper ───────────────────────────────────────────────────────

def _apply_update(session: VideoSession, data: VideoSessionUpdate) -> None:
    """Apply a VideoSessionUpdate to the ORM object in-place."""
    # Status: never downgrade from a terminal state
    if data.status and session.status not in _TERMINAL:
        session.status = data.status

    if data.inspection_id     is not None: session.inspection_id     = data.inspection_id
    if data.duration_seconds  is not None: session.duration_seconds  = data.duration_seconds
    if data.min_duration_met  is not None: session.min_duration_met  = data.min_duration_met
    if data.last_known_phase  is not None: session.last_known_phase  = data.last_known_phase
    if data.failure_reason    is not None: session.failure_reason    = data.failure_reason
    if data.interruption_type is not None: session.interruption_type = data.interruption_type

    # Flags: only upgrade to True — once set they stay set
    if data.app_backgrounded: session.app_backgrounded = True
    if data.app_unloaded:     session.app_unloaded     = True
    if data.upload_started:   session.upload_started   = True
    if data.upload_finalized: session.upload_finalized = True

    # Timestamps: only set once (first-write wins for started_at fields)
    if data.recording_started_at is not None and session.recording_started_at is None:
        session.recording_started_at = data.recording_started_at
    if data.recording_stopped_at is not None:
        session.recording_stopped_at = data.recording_stopped_at
    if data.upload_started_at is not None and session.upload_started_at is None:
        session.upload_started_at = data.upload_started_at
    if data.upload_finished_at is not None:
        session.upload_finished_at = data.upload_finished_at
