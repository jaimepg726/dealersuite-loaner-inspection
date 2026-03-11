---
name: DealerSuite Engineering
description: Safe engineering workflow for maintaining the DealerSuite Loaner Inspection system used in a dealership service drive.
---

# DealerSuite Engineering Skill

This skill defines safe engineering practices for modifying DealerSuite.

DealerSuite is a production application used in a dealership service drive to record vehicle inspections and prevent loaner damage disputes.

The system must prioritize:
- reliability
- inspection data integrity
- stable uploads
- safe deployments

Never introduce breaking changes.

## System Overview

| Layer    | Technology                        |
|----------|-----------------------------------|
| Frontend | React + Vite                      |
| Backend  | FastAPI + SQLAlchemy              |
| Database | PostgreSQL (asyncpg)              |
| Media Storage | Google Drive primary, Local fallback |
| Deployment | Docker container deployed on Railway |

Important backend folders:
- `backend/routes`
- `backend/models`
- `backend/storage`
- `backend/services`

## Critical Workflow

This workflow must never break:

1. Porter selects inspection type
2. Vehicle identified via VIN or loaner number
3. Inspection record created
4. Photos/videos captured
5. Media uploaded
6. Manager reviews inspection

## Backend Rules

Never rename existing API endpoints.

Avoid database schema changes unless required.

Before committing backend code run:
```
python3 -m py_compile backend/routes/*.py
```

Uploads must:
- verify inspection exists
- validate MIME type
- retry once if Drive fails
- prevent duplicate uploads

Supported MIME types:
- image/jpeg
- image/png
- image/webp
- video/mp4
- video/quicktime
- video/webm
- video/x-msvideo

Max upload size: **100MB**

## Google Drive Rules

Drive tokens stored in DB:
- `google_access_token`
- `google_refresh_token`
- `google_token_expiry`

Before upload: If token expires in <5 minutes, call `refresh_access_token()` and persist new tokens.

Drive media URLs must convert to:
```
https://drive.google.com/uc?export=view&id=FILE_ID
```

## Porter Workflow Rules

Porter UI must remain simple.

Homepage actions:
- Loaner Out
- Loaner Return
- Manager Review

Porters must be able to:
- scan VIN
- enter loaner number
- capture photos
- record video

**Video button must always remain visible.**

## Deployment Rules

Never commit frontend build artifacts.

Ensure `.gitignore` contains:
```
frontend/dist
```

Docker builds frontend during deploy.
