"""
Regression tests for video session lifecycle logic.

Tests the _apply_update and terminal-status rules directly as pure logic —
no database or FastAPI imports required.

The logic is replicated inline from routes/sessions.py so it can be verified
without importing the full app stack.

Run with:
    cd backend && pip install pytest pytest-asyncio && pytest tests/ -v
"""

from datetime import datetime, timezone

import pytest


# ── Replicated logic from routes/sessions.py ─────────────────────────────────

_TERMINAL = frozenset({
    "completed", "failed_upload", "abandoned",
    "closed_early", "interrupted", "expired",
})


class _Session:
    """Minimal stand-in for the VideoSession ORM model."""
    def __init__(self, status="started"):
        self.status              = status
        self.inspection_id       = None
        self.duration_seconds    = None
        self.min_duration_met    = None
        self.last_known_phase    = None
        self.failure_reason      = None
        self.interruption_type   = None
        self.app_backgrounded    = False
        self.app_unloaded        = False
        self.upload_started      = False
        self.upload_finalized    = False
        self.recording_started_at  = None
        self.recording_stopped_at  = None
        self.upload_started_at     = None
        self.upload_finished_at    = None


class _Update:
    """Minimal stand-in for VideoSessionUpdate schema."""
    def __init__(self, **kw):
        self.status              = kw.get("status")
        self.inspection_id       = kw.get("inspection_id")
        self.duration_seconds    = kw.get("duration_seconds")
        self.min_duration_met    = kw.get("min_duration_met")
        self.last_known_phase    = kw.get("last_known_phase")
        self.failure_reason      = kw.get("failure_reason")
        self.interruption_type   = kw.get("interruption_type")
        self.app_backgrounded    = kw.get("app_backgrounded", False)
        self.app_unloaded        = kw.get("app_unloaded",     False)
        self.upload_started      = kw.get("upload_started",   False)
        self.upload_finalized    = kw.get("upload_finalized",  False)
        self.recording_started_at  = kw.get("recording_started_at")
        self.recording_stopped_at  = kw.get("recording_stopped_at")
        self.upload_started_at     = kw.get("upload_started_at")
        self.upload_finished_at    = kw.get("upload_finished_at")


def _apply_update(session, data):
    """Replicated from routes/sessions.py — must stay in sync."""
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


def _now():
    return datetime.now(timezone.utc)


# ── Terminal status protection ────────────────────────────────────────────────

@pytest.mark.parametrize("terminal", sorted(_TERMINAL))
def test_terminal_status_never_downgraded(terminal):
    """Once a session reaches a terminal status it must not be overwritten."""
    s = _Session(status=terminal)
    _apply_update(s, _Update(status="recording"))
    assert s.status == terminal, (
        f"Terminal status '{terminal}' was overwritten with 'recording'"
    )


def test_non_terminal_status_can_advance():
    s = _Session(status="started")
    _apply_update(s, _Update(status="recording"))
    assert s.status == "recording"


def test_status_advance_to_completed():
    s = _Session(status="uploading")
    _apply_update(s, _Update(status="completed"))
    assert s.status == "completed"


def test_completed_not_downgraded_to_failed():
    s = _Session(status="completed")
    _apply_update(s, _Update(status="failed_upload"))
    assert s.status == "completed"


# ── Flag-only-upgrade pattern ─────────────────────────────────────────────────

def test_app_backgrounded_only_goes_true():
    s = _Session()
    assert s.app_backgrounded is False
    _apply_update(s, _Update(app_backgrounded=True))
    assert s.app_backgrounded is True
    # A subsequent update without the flag must NOT reset it
    _apply_update(s, _Update(status="recording"))
    assert s.app_backgrounded is True


def test_app_unloaded_only_goes_true():
    s = _Session()
    _apply_update(s, _Update(app_unloaded=True))
    assert s.app_unloaded is True
    _apply_update(s, _Update())
    assert s.app_unloaded is True


def test_upload_flags_only_go_true():
    s = _Session()
    _apply_update(s, _Update(upload_started=True, upload_finalized=True))
    assert s.upload_started is True
    assert s.upload_finalized is True


# ── Too-short session (stopped_short) ─────────────────────────────────────────

def test_stopped_short_marks_correctly():
    s = _Session(status="recording")
    _apply_update(s, _Update(
        status="stopped_short",
        duration_seconds=30.0,
        min_duration_met=False,
        failure_reason="Recording 30s — minimum 72s required",
    ))
    assert s.status == "stopped_short"
    assert s.min_duration_met is False
    assert s.duration_seconds == 30.0
    assert "30s" in s.failure_reason


def test_min_duration_met_set_true():
    s = _Session(status="recording")
    _apply_update(s, _Update(
        status="ready_for_upload",
        duration_seconds=80.0,
        min_duration_met=True,
    ))
    assert s.status == "ready_for_upload"
    assert s.min_duration_met is True


# ── Interrupted session ───────────────────────────────────────────────────────

def test_interrupted_status_set_with_reason():
    s = _Session(status="recording")
    _apply_update(s, _Update(
        status="interrupted",
        interruption_type="pagehide",
        failure_reason="App closed during recording",
    ))
    assert s.status == "interrupted"
    assert s.interruption_type == "pagehide"
    assert "App closed" in s.failure_reason


def test_interrupted_is_terminal():
    s = _Session(status="interrupted")
    _apply_update(s, _Update(status="recording"))
    assert s.status == "interrupted"


# ── Upload never finalized ────────────────────────────────────────────────────

def test_upload_started_but_never_finalized():
    """Represents a session where upload began but complete was never called."""
    s = _Session(status="uploading")
    _apply_update(s, _Update(
        upload_started=True,
        upload_started_at=_now(),
    ))
    # Simulate lazy-expiry marking it interrupted — upload_finalized stays False
    _apply_update(s, _Update(status="interrupted"))
    assert s.upload_started is True
    assert s.upload_finalized is False
    assert s.status == "interrupted"


def test_successful_upload_marks_finalized():
    s = _Session(status="uploading")
    _apply_update(s, _Update(
        status="completed",
        upload_finalized=True,
        upload_finished_at=_now(),
    ))
    assert s.status == "completed"
    assert s.upload_finalized is True


# ── Completed session (happy path) ───────────────────────────────────────────

def test_happy_path():
    s = _Session(status="started")

    _apply_update(s, _Update(status="recording", recording_started_at=_now()))
    assert s.status == "recording"
    assert s.recording_started_at is not None

    _apply_update(s, _Update(
        status="ready_for_upload",
        duration_seconds=90.0,
        min_duration_met=True,
        recording_stopped_at=_now(),
    ))
    assert s.status == "ready_for_upload"
    assert s.min_duration_met is True

    _apply_update(s, _Update(
        status="uploading",
        upload_started=True,
        upload_started_at=_now(),
    ))
    assert s.status == "uploading"

    _apply_update(s, _Update(
        status="completed",
        upload_finalized=True,
        upload_finished_at=_now(),
    ))
    assert s.status == "completed"
    assert s.upload_finalized is True


# ── Timestamp first-write-wins ────────────────────────────────────────────────

def test_recording_started_at_first_write_wins():
    t1 = datetime(2025, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
    t2 = datetime(2025, 1, 1, 10, 5, 0, tzinfo=timezone.utc)
    s = _Session()
    _apply_update(s, _Update(recording_started_at=t1))
    _apply_update(s, _Update(recording_started_at=t2))
    assert s.recording_started_at == t1, "recording_started_at should keep first value"


def test_upload_started_at_first_write_wins():
    t1 = datetime(2025, 1, 1, 11, 0, 0, tzinfo=timezone.utc)
    t2 = datetime(2025, 1, 1, 11, 5, 0, tzinfo=timezone.utc)
    s = _Session()
    _apply_update(s, _Update(upload_started_at=t1))
    _apply_update(s, _Update(upload_started_at=t2))
    assert s.upload_started_at == t1


def test_recording_stopped_at_can_be_updated():
    """Stopped_at is overwriteable (re-record then stop again is valid)."""
    t1 = datetime(2025, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
    t2 = datetime(2025, 1, 1, 10, 5, 0, tzinfo=timezone.utc)
    s = _Session()
    _apply_update(s, _Update(recording_stopped_at=t1))
    _apply_update(s, _Update(recording_stopped_at=t2))
    assert s.recording_stopped_at == t2
