# Open Bugs

Last updated: 2026-03-25

---

## RESOLVED — "2 videos uploaded" on completion screen

**Priority**: P0 (was showing on production)
**Status**: Fixed 2026-03-25

**Root cause**: Race between the direct-Drive upload path and the legacy fallback:
1. `/upload-session` pre-creates an `InspectionMedia` row with `file_url="pending"` and `file_hash=NULL`
2. If the Drive PUT or `/finalize-upload` fails, frontend falls back to `POST /upload`
3. Legacy `/upload` hash-dedup checks `file_hash == sha256(content)`, but the pending row has `file_hash=NULL` → no match → creates a **second** `InspectionMedia` row
4. `_compute_media_counts` counts every row with `media_type='video'` → `video_count=2`

**Fix summary** (all in this commit):
- Backend `/upload-session`: pending orphan is deleted and retry allowed; finalized record blocks (409). Removed the 60s time window.
- Backend `/upload` (legacy): video-specific dedup before hash check — any existing video row returns deduplicated.
- Schema `_compute_media_counts`: filters `file_url="pending"` from counts and media list so orphans are never visible even if dedup fails.

**Evidence it was happening**: The original `/upload-session` dedup had a 60-second window. Any scenario where the fallback was triggered within that window would still produce duplicate records because the hash-dedup on the legacy path couldn't match the NULL-hash pending row.

---

## Known risk — re-record + existing finalized video

**Priority**: Low / UX
**Status**: Open (by design for now)

If a session is resumed (via sessionStorage) and the inspection already has a finalized video, the porter will be able to re-record but the new video upload will be blocked by the `/upload-session` 409 guard. The upload will silently succeed with `backend="skipped-duplicate"` and the original video remains.

**Impact**: Low. The original video is preserved, not lost. The porter will see no error but the completion screen will show the original video.

**Possible fix**: Show a warning if `video_count > 0` before starting VideoRecorder. Not implemented yet.

---

## Known risk — pending orphan after `/finalize-upload` failure

**Priority**: Low
**Status**: Open

If `/upload-session` creates a pending row, the Drive PUT succeeds, but `/finalize-upload` fails, the pending row is deleted on the next `/upload-session` call (retry). However, the video file is already on Drive as an orphan with no corresponding DB record.

**Impact**: Orphaned Drive files accumulate. No user-visible error. The retry creates a new upload + new record successfully.

**Possible fix**: Store the Drive file ID in the pending row so it can be cleaned up on retry. Not implemented.

---

## Known risk — no frontend tests

**Priority**: Medium / technical debt
**Status**: Open

Vitest is not configured. The frontend dedup behavior (`videoUploadedRef`, `uploadsStartedRef`, `videoCaptureLockRef`, `continueFiredRef`) is tested only via backend guards. A broken frontend guard would still be caught by the backend, but regression visibility is low.

**Possible fix**: Add vitest + @testing-library/react, test the key guard refs.
