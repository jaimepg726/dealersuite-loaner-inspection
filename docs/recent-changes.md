# Recent Changes

Last updated: 2026-03-25

Significant changes from the last 2 weeks (reverse chronological).

---

## 2026-03-25 — duplicate video root-cause fix (this session)

**Problem**: Production smoke test showed "2 videos uploaded" on completion screen.

**Root cause**: `/upload-session` creates a pending `InspectionMedia` row (`file_url="pending"`, `file_hash=NULL`). If Drive PUT or `/finalize-upload` fails, the frontend falls back to legacy `/upload`. Legacy `/upload`'s hash-dedup missed the pending row (hash is NULL), so it created a second row. `_compute_media_counts` counted both → `video_count=2`.

**Fixes applied**:
- `backend/routes/inspect.py` `/upload-session`: pending orphan → delete and allow retry; finalized record → 409. No time window (old 60s window was too short for session-resume).
- `backend/routes/inspect.py` `/upload` (legacy): video-specific dedup added before hash check — if any video row exists, return deduplicated.
- `backend/schemas/inspection.py` `_compute_media_counts`: filters `file_url="pending"` from media list and counts.
- `frontend/src/components/inspection/VideoRecorder.jsx`: extracted step config, added top-down car SVG.
- `frontend/src/config/walkroundSteps.js`: new file for step timing config.
- `backend/tests/test_video_dedup.py`: regression tests for all three fix layers.

---

## 2026-03-24 — closure safety comment

- `InspectPage.jsx`: added comment explaining why `inspection` is safe to read in `kickOffUploads` (plain function, recreated each render — no stale closure risk).

---

## ~2026-03-22 — performance: Drive folder cache

- `drive_backend.py`: added 3-layer folder cache (in-memory → DB → Drive API). Previously the first `upload-session` of the day caused a 15–20s hang waiting for Drive folder API calls. Now uses `FOLDER_TIMEOUT=10s` for all Drive API calls.

---

## ~2026-03-21 — walkround overlay

- `VideoRecorder.jsx`: added 9-step guided walkround overlay with per-step countdown timers, progress dots, and 60s minimum recording lock. Porter is guided around the vehicle at each step.

---

## ~2026-03-20 — kickOffUploadsRef pattern

- `InspectPage.jsx`: stored `kickOffUploads` in a ref so it always captures the latest `uploadFile`/`inspection` values without needing `useCallback` dependency chaining. Prevents a re-render mid-upload from producing a stale closure.

---

## ~2026-03-19 — inspectionRef + uploadFile closure fix

- `useInspection.js`: added `inspectionRef` mirroring inspection state. `uploadFile` now uses `inspectionRef.current` instead of closing over `inspection` state, eliminating stale closure after `setInspection()` runs mid-upload.

---

## ~2026-03-18 — session resume to prevent duplicate /start

- `InspectPage.jsx`: on mount, checks `sessionStorage` for an existing inspection ID for this vehicle. If found, resumes instead of calling `/start` again. Prevents duplicate inspections from page refreshes.
- `useInspection.js`: added `resume(id)` function that fetches an existing inspection by ID.

---

## ~2026-03-17 — VideoRecorder Continue guard

- `VideoRecorder.jsx`: added `continueFiredRef` guard on the Continue button to prevent double-invocation from rapid taps.
- Added `videoCaptureLockRef` in `InspectPage.jsx` for the same purpose at the page level.

---

## ~2026-03-15 — direct-to-Drive upload

- New upload path: browser PUTs video bytes directly to Google Drive resumable URL. Railway handles only JSON (no media bytes through Railway). Includes `/upload-session` and `/finalize-upload` endpoints.
- Legacy `/upload` retained as fallback when Drive is not connected.
