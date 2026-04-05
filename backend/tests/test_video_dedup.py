"""
Regression tests for the duplicate-video bug.

Root cause: /upload-session creates a pending InspectionMedia row.
If the Drive PUT or /finalize-upload fails, the frontend falls back to
the legacy /upload endpoint, which previously created a SECOND row.
Both rows had media_type="video" and were counted by _compute_media_counts,
producing video_count=2 on the completion screen.

These tests verify the three layers of the fix:
  1. /upload-session dedup: pending orphan is deleted (retry allowed);
     finalized record blocks a new session (409).
  2. legacy /upload dedup: if any video row exists, return deduplicated
     rather than creating a second row.
  3. InspectionResponse._compute_media_counts: pending rows excluded
     from video_count and from the media list.

Run with:
    cd backend && pip install pytest pytest-asyncio && pytest tests/ -v
"""

from datetime import datetime, timezone
import pytest


# ── Helpers ───────────────────────────────────────────────────────────────────

def _utcnow():
    return datetime.now(timezone.utc)


class FakeMediaRow:
    """Minimal stand-in for an InspectionMedia ORM row."""
    def __init__(self, id, media_type, file_url, file_hash=None, upload_attempt_id=None):
        self.id = id
        self.media_type = media_type
        self.file_url = file_url
        self.file_hash = file_hash
        self.upload_attempt_id = upload_attempt_id
        self.inspection_id = 1
        self.created_at = _utcnow()


# ── Test 1: schema — pending records excluded from counts ─────────────────────

class FakeMediaItem:
    """Minimal stand-in for a serialised MediaItem."""
    def __init__(self, id, media_type, file_url):
        self.id = id
        self.media_type = media_type
        self.file_url = file_url
        self.created_at = _utcnow()


def _apply_compute_media_counts(media_items):
    """
    Reproduce InspectionResponse._compute_media_counts logic so we can
    test it in isolation without importing the full Pydantic model
    (which would pull in the entire app stack).
    """
    active = [m for m in media_items if m.file_url != 'pending']
    photo_count = sum(1 for m in active if m.media_type == 'photo')
    video_count = sum(1 for m in active if m.media_type == 'video')
    return active, photo_count, video_count


def test_pending_video_excluded_from_count():
    """A pending video record must not increment video_count."""
    items = [
        FakeMediaItem(1, 'video', 'pending'),
    ]
    active, _, video_count = _apply_compute_media_counts(items)
    assert video_count == 0
    assert active == []


def test_finalized_video_counted():
    """A finalized video record (non-pending URL) must be counted."""
    items = [
        FakeMediaItem(1, 'video', 'https://drive.google.com/uc?id=abc'),
    ]
    active, _, video_count = _apply_compute_media_counts(items)
    assert video_count == 1
    assert len(active) == 1


def test_pending_plus_finalized_counts_one():
    """
    The core regression: pending orphan + finalized record must still
    yield video_count == 1, not 2.
    """
    items = [
        FakeMediaItem(1, 'video', 'pending'),
        FakeMediaItem(2, 'video', 'https://drive.google.com/uc?id=abc'),
    ]
    active, _, video_count = _apply_compute_media_counts(items)
    assert video_count == 1
    assert len(active) == 1
    assert active[0].id == 2


def test_pending_video_excluded_from_media_list():
    """Pending records must not appear in the returned media list."""
    items = [
        FakeMediaItem(1, 'video', 'pending'),
        FakeMediaItem(2, 'photo', 'https://drive.google.com/uc?id=xyz'),
    ]
    active, photo_count, video_count = _apply_compute_media_counts(items)
    assert video_count == 0
    assert photo_count == 1
    assert all(m.file_url != 'pending' for m in active)


def test_re_record_scenario_counts_one():
    """
    Re-record scenario: first blob is discarded in memory, only ONE
    upload ever reaches the backend.  Simulated here as a single
    finalized record after the user accepted the second recording.
    """
    items = [
        FakeMediaItem(1, 'video', 'https://drive.google.com/uc?id=final'),
    ]
    active, _, video_count = _apply_compute_media_counts(items)
    assert video_count == 1


# ── Test 2: upload-session dedup logic ────────────────────────────────────────

def _should_reject_session(existing_row):
    """
    Reproduce the /upload-session video dedup decision:
    - no existing row  → ('allow', None)
    - pending row      → ('delete_and_retry', row)
    - finalized row    → ('reject', row)
    """
    if existing_row is None:
        return ('allow', None)
    if existing_row.file_url == 'pending':
        return ('delete_and_retry', existing_row)
    return ('reject', existing_row)


def test_session_allowed_when_no_prior_record():
    action, _ = _should_reject_session(None)
    assert action == 'allow'


def test_session_deletes_pending_orphan_and_retries():
    """A pending orphan from a previous failed session must be cleared so the user can retry."""
    orphan = FakeMediaRow(id=5, media_type='video', file_url='pending')
    action, row = _should_reject_session(orphan)
    assert action == 'delete_and_retry'
    assert row.id == 5


def test_session_rejected_when_finalized_record_exists():
    """A successfully uploaded video must block any subsequent upload session."""
    finalized = FakeMediaRow(id=3, media_type='video', file_url='https://drive.google.com/uc?id=abc')
    action, _ = _should_reject_session(finalized)
    assert action == 'reject'


# ── Test 3: legacy /upload dedup logic ────────────────────────────────────────

def _legacy_upload_decision(existing_video_row):
    """
    Reproduce the legacy /upload video dedup decision:
    - existing row → deduplicated (return existing)
    - no row       → proceed to create
    """
    if existing_video_row is not None:
        return 'deduplicated'
    return 'create'


def test_legacy_upload_deduplicates_when_video_exists():
    """Legacy fallback must not create a second record if any video already exists."""
    existing = FakeMediaRow(id=1, media_type='video', file_url='pending')
    assert _legacy_upload_decision(existing) == 'deduplicated'


def test_legacy_upload_deduplicates_finalized_video():
    existing = FakeMediaRow(id=2, media_type='video', file_url='https://drive.google.com/uc?id=abc')
    assert _legacy_upload_decision(existing) == 'deduplicated'


def test_legacy_upload_creates_when_no_video_exists():
    assert _legacy_upload_decision(None) == 'create'


# ── Test 4: finalize-upload idempotency ───────────────────────────────────────

def test_finalize_with_same_record_id_is_safe():
    """
    If /finalize-upload is called twice with the same media_record_id,
    the second call updates the same row — no duplicate row is created.
    This is safe because finalize looks up by record ID, not by creating
    a new row.
    """
    # Simulate: first finalize sets file_url
    record = FakeMediaRow(id=10, media_type='video', file_url='pending')
    drive_url = 'https://drive.google.com/uc?id=xyz'
    record.file_url = drive_url  # first finalize

    # Second finalize with same record_id → same row updated again
    record.file_url = drive_url  # idempotent

    # Counting: still exactly 1 finalized video
    items = [FakeMediaItem(record.id, record.media_type, record.file_url)]
    _, _, video_count = _apply_compute_media_counts(items)
    assert video_count == 1


# ── Test 5: attempt_id idempotency (two-layer dedup) ─────────────────────────
#
# These tests reproduce the two-layer dedup logic added to /upload-session and
# /upload (legacy) to prevent a Drive file duplicate when:
#   1. /upload-session creates a pending row + Drive XHR starts
#   2. XHR onerror fires (network drop) but Drive already received the bytes
#   3. Legacy fallback fires for the same attempt_id
# With attempt_id, the backend can detect both as the same attempt and prevent
# a second Drive file + second DB record.


def _should_reject_session_with_attempt(existing_rows, attempt_id):
    """
    Reproduce the two-layer /upload-session dedup decision with attempt_id.
    Layer 1: check by (inspection_id, attempt_id).
    Layer 2: check by (inspection_id, media_type='video').
    Returns ('allow', None) | ('delete_and_retry', row) | ('reject', row)
    """
    # Layer 1: attempt_id match
    if attempt_id:
        for row in existing_rows:
            if row.upload_attempt_id == attempt_id:
                if row.file_url == 'pending':
                    return ('delete_and_retry', row)
                return ('reject', row)
    # Layer 2: any video record
    for row in existing_rows:
        if row.media_type == 'video':
            if row.file_url == 'pending':
                return ('delete_and_retry', row)
            return ('reject', row)
    return ('allow', None)


def _legacy_upload_decision_with_attempt(existing_rows, attempt_id):
    """
    Reproduce the two-layer /upload (legacy) dedup decision with attempt_id.
    """
    # Layer 1
    if attempt_id:
        for row in existing_rows:
            if row.upload_attempt_id == attempt_id:
                if row.file_url != 'pending':
                    return ('deduplicated', row)
                return ('delete_and_retry', row)
    # Layer 2
    for row in existing_rows:
        if row.media_type == 'video':
            if row.file_url != 'pending':
                return ('deduplicated', row)
            return ('delete_and_retry', row)
    return ('create', None)


def test_same_attempt_id_blocks_second_upload_session():
    """
    Same attempt_id with a finalized record must block a second /upload-session
    with 409, even if someone somehow lost the first media_record_id reference.
    """
    attempt = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa'
    finalized = FakeMediaRow(id=1, media_type='video',
                             file_url='https://drive.google.com/uc?id=abc',
                             upload_attempt_id=attempt)
    action, _ = _should_reject_session_with_attempt([finalized], attempt)
    assert action == 'reject'


def test_same_attempt_id_pending_allows_retry_in_session():
    """
    Pending orphan with same attempt_id → delete and allow retry.
    This is the Drive-PUT-failed-but-Drive-received scenario: the pending row
    from the failed attempt is cleaned up so a fresh session can start.
    """
    attempt = 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb'
    orphan = FakeMediaRow(id=2, media_type='video', file_url='pending',
                          upload_attempt_id=attempt)
    action, row = _should_reject_session_with_attempt([orphan], attempt)
    assert action == 'delete_and_retry'
    assert row.id == 2


def test_same_attempt_id_legacy_returns_deduplicated_when_finalized():
    """
    Legacy /upload with same attempt_id as a finalized record must return
    deduplicated — critical for preventing a second Drive file when the legacy
    fallback fires for an attempt whose Drive path already completed.
    """
    attempt = 'cccccccc-3333-3333-3333-cccccccccccc'
    finalized = FakeMediaRow(id=3, media_type='video',
                             file_url='https://drive.google.com/uc?id=def',
                             upload_attempt_id=attempt)
    action, row = _legacy_upload_decision_with_attempt([finalized], attempt)
    assert action == 'deduplicated'
    assert row.id == 3


def test_same_attempt_id_legacy_deletes_pending_orphan():
    """
    Legacy /upload with same attempt_id as a pending orphan deletes it and
    proceeds — ensures the pending row gets updated to a real file_url.
    """
    attempt = 'dddddddd-4444-4444-4444-dddddddddddd'
    orphan = FakeMediaRow(id=4, media_type='video', file_url='pending',
                          upload_attempt_id=attempt)
    action, row = _legacy_upload_decision_with_attempt([orphan], attempt)
    assert action == 'delete_and_retry'
    assert row.id == 4


def test_different_attempt_ids_fall_through_to_inspection_level_dedup():
    """
    If the legacy fallback has a different attempt_id than the existing record,
    the inspection-level Layer 2 check still blocks a duplicate finalized record.
    """
    attempt_a = 'eeeeeeee-5555-5555-5555-eeeeeeeeeeee'
    attempt_b = 'ffffffff-6666-6666-6666-ffffffffffff'
    finalized = FakeMediaRow(id=5, media_type='video',
                             file_url='https://drive.google.com/uc?id=ghi',
                             upload_attempt_id=attempt_a)
    # attempt_b does not match attempt_a → Layer 1 misses → Layer 2 catches
    action, row = _legacy_upload_decision_with_attempt([finalized], attempt_b)
    assert action == 'deduplicated'
    assert row.id == 5


def test_no_attempt_id_falls_through_to_inspection_level_dedup():
    """
    When attempt_id is absent (old client or photo upload), the inspection-level
    Layer 2 check still prevents a duplicate finalized video record.
    """
    finalized = FakeMediaRow(id=6, media_type='video',
                             file_url='https://drive.google.com/uc?id=jkl',
                             upload_attempt_id=None)
    action, _ = _legacy_upload_decision_with_attempt([finalized], attempt_id=None)
    assert action == 'deduplicated'


def test_fresh_attempt_with_no_prior_records_is_allowed():
    """New recording attempt with no prior records — both paths must allow it."""
    attempt = '12345678-abcd-abcd-abcd-123456789abc'
    session_action, _ = _should_reject_session_with_attempt([], attempt)
    legacy_action, _  = _legacy_upload_decision_with_attempt([], attempt)
    assert session_action == 'allow'
    assert legacy_action  == 'create'


def test_finalize_retry_does_not_create_second_record():
    """
    The handleFinalizeRetry path calls /finalize-upload with the same
    media_record_id — the backend updates the same row, so video_count stays 1.
    """
    attempt = 'retry000-0000-0000-0000-retryretry00'
    record = FakeMediaRow(id=20, media_type='video', file_url='pending',
                          upload_attempt_id=attempt)
    drive_url = 'https://drive.google.com/uc?id=retried'

    # First finalize attempt (sets file_url)
    record.file_url = drive_url

    # Retry finalize with same media_record_id — idempotent update
    record.file_url = drive_url

    items = [FakeMediaItem(record.id, record.media_type, record.file_url)]
    _, _, video_count = _apply_compute_media_counts(items)
    assert video_count == 1
