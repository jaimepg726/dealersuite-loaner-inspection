# DealerSuite Loaner Inspection — Project Context

Last updated: 2026-03-25

## What this app does

Dealership porters use an iPad/phone to walk around loaner vehicles and record:
- A guided 60-second walkround video (9 steps, auto-advancing overlay)
- Still photos of any damage found
- Text damage notes per location

Managers review inspections and damage on a separate dashboard. Media is stored in Google Drive.

---

## Roles

| Role    | UI            | Access                                         |
|---------|---------------|------------------------------------------------|
| Porter  | Porter UI     | Start inspection, record video, log damage     |
| Manager | Manager dashboard | View inspections, media gallery, damage, reports |

Porters log in via PIN selection (no password). Managers use username + password.

---

## Tech stack

| Layer    | Technology                                |
|----------|-------------------------------------------|
| Frontend | React 18 + Vite + Tailwind CSS (PWA)      |
| Backend  | FastAPI (Python) on Railway               |
| DB       | PostgreSQL (Railway managed)              |
| Storage  | Google Drive (OAuth2, resumable upload)   |
| Auth     | JWT (access + refresh tokens)             |

---

## Core flow

```
Porter selects vehicle
  → InspectPage mounts → POST /api/inspect/start
  → VideoRecorder (guided walkround, 9 steps, 60s min)
  → DamageLogger (optional damage + photos)
  → kickOffUploads()
      Step 1: uploadFile(videoBlob, 'video')
        → try _directDriveUpload():
            POST /upload-session  (creates pending InspectionMedia row)
            XHR PUT → Drive resumable URL  (file bytes never touch Railway)
            POST /finalize-upload  (updates row with Drive file URL)
        → catch → fallback _legacyUpload():
            POST /upload  (multipart through Railway, saves to DB + tries Drive)
      Step 2: uploadFile(photo, 'photo') × N
      Step 3: POST /api/inspect/{id}/damage × N
      Step 4: POST /api/inspect/{id}/complete
  → Done screen shows video_count, photo_count, Drive folder link
```

---

## Upload system

Two upload paths exist (Drive connected = direct; Drive not connected = legacy):

### Direct-to-Drive (preferred)
1. `POST /upload-session` — backend creates a resumable Drive upload URL and a pre-created `InspectionMedia` row with `file_url="pending"`
2. Browser PUTs bytes directly to Drive's resumable URL (zero Railway bandwidth)
3. `POST /finalize-upload` — backend updates the pending row with the Drive file URL

### Legacy (fallback when Drive is not connected or direct path fails)
1. `POST /upload` — multipart through Railway, saves bytes to DB as BYTEA, then opportunistically uploads to Drive if connected

### Dedup protection (as of 2026-03-25)
- `/upload-session`: if a **finalized** video row exists → 409. If a **pending** orphan exists → delete orphan and allow retry.
- `/upload` legacy: if ANY video row exists → return deduplicated, never create a second row.
- `InspectionResponse._compute_media_counts`: filters `file_url="pending"` from counts and media list.

---

## Key files

| File | Purpose |
|------|---------|
| `frontend/src/pages/InspectPage.jsx` | Top-level inspection orchestrator, upload flow |
| `frontend/src/hooks/useInspection.js` | Upload logic, inspectionRef, videoUploadedRef |
| `frontend/src/components/inspection/VideoRecorder.jsx` | Camera UI, walkround overlay, SVG car graphic |
| `frontend/src/config/walkroundSteps.js` | Step config + timing (edit here for testing) |
| `backend/routes/inspect.py` | All inspection API routes including upload, dedup |
| `backend/schemas/inspection.py` | InspectionResponse validator (filters pending media) |
| `backend/storage/drive_backend.py` | Google Drive OAuth, folder management, upload |
| `backend/models/inspection_media.py` | InspectionMedia ORM model |

---

## Known risks

1. **Pending orphan accumulation**: If `/finalize-upload` repeatedly fails, the orphan is deleted and re-created on each retry. This is correct but means a truly broken Drive session will show no video at the end.
2. **Legacy path Drive upload**: The legacy `/upload` still opportunistically tries Drive internally. This path is correct (deduped at record-creation level) but produces a different Drive file than the direct path would.
3. **Re-record + resume**: If a user session-resumes an inspection that had a finalized video, attempting to record again will be blocked at `/upload-session` (409). This is intentional — it prevents overwriting, but UX could be improved.
4. **No frontend tests**: Vitest is not configured. Frontend dedup behavior relies entirely on backend guards.
