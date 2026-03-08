# DealerSuite — Loaner Damage Inspection

A Progressive Web App for automotive dealerships to record, timestamp, and store loaner vehicle inspection videos and photos in Google Drive.

## Platform

Part of the **DealerSuite** suite of dealership service tools.

---

## Features

- VIN scanning (barcode, camera OCR, or manual entry)
- Video walkaround inspections (< 30 seconds)
- Photo capture during recording
- Automatic Google Drive folder organization
- Fleet CSV import from TSD Dealer
- Manager dashboard with damage review and RO assignment
- Reports and KPI stats
- PWA — installs on iPad, iPhone, Android, and desktop

---

## Tech Stack

| Layer      | Technology            |
|------------|-----------------------|
| Frontend   | React 18 + Vite (PWA) |
| Backend    | FastAPI (Python)      |
| Database   | PostgreSQL            |
| Storage    | Google Drive API      |
| Auth       | JWT (8-hour tokens)   |
| Hosting    | Railway               |

---

## Project Structure

```
dealersuite-loaner-inspection/
├── backend/
│   ├── main.py
│   ├── config.py
│   ├── database.py
│   ├── dependencies.py
│   ├── routes/          # auth, vehicles, inspect, fleet, manager
│   ├── models/          # User, Vehicle, Inspection, Damage
│   ├── schemas/         # Pydantic request/response schemas
│   ├── services/        # auth, drive, fleet, inspection, damage, vehicle
│   ├── alembic/         # Database migrations
│   └── seed.py          # Default admin/manager accounts
├── frontend/
│   ├── public/
│   └── src/
│       ├── components/
│       │   ├── ui/          # LoadingScreen, BottomNav, PageHeader, etc.
│       │   ├── inspection/  # BarcodeScanner, OCRScanner, ManualVINEntry
│       │   └── dashboard/   # StatCard, InspectionCard, DamageCard, FleetTable
│       ├── pages/
│       │   └── dashboard/   # FleetPage, InspectionsPage, DamagePage, ReportsPage
│       ├── hooks/           # useInspection, useVINValidation, useVehicleLookup
│       └── utils/           # api.js (axios + JWT interceptors)
└── docs/
    └── sample_fleet.csv
```

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL (or Railway Postgres service)
- Google Cloud project with Drive API enabled (see below)

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env          # Fill in your values
alembic upgrade head          # Run migrations
python seed.py                # Create default admin/manager accounts
uvicorn main:app --reload
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

---

## Default Accounts (after seed.py)

| Role    | Email                      | Password       |
|---------|----------------------------|----------------|
| Admin   | admin@dealersuite.app      | ChangeMe123!   |
| Manager | manager@dealersuite.app    | ChangeMe123!   |

Change these immediately in production.

---

## Google Drive Integration

Inspection videos and damage photos are organized automatically in Google Drive:

```
DealerSuite Loaner Inspections/
  └── Loaner_M499/
        └── 2026-03-07_Checkout/
              ├── 2026-03-07_Checkout_video.mp4
              └── damage_front_01.jpg
```

### Setup (one-time)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable the **Google Drive API** (`APIs & Services → Enable APIs`)
4. Create a **Service Account** (`IAM & Admin → Service Accounts → Create`)
   - Grant the **Editor** role (or a custom Drive role)
5. Under the service account → **Keys → Add Key → JSON** — download the file
6. In your Google Drive, **share the root folder** with the service account email
   (looks like `name@your-project.iam.gserviceaccount.com`) and grant **Editor** access

### Local development

Place `service_account.json` in the `backend/` directory and set:

```env
GOOGLE_SERVICE_ACCOUNT_FILE=service_account.json
```

### Railway / production

Base64-encode the service account JSON and set the env var:

```bash
# Linux / Mac
base64 -w 0 service_account.json

# PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("service_account.json"))
```

Then in Railway → Variables:

```
GOOGLE_SERVICE_ACCOUNT_JSON=<paste base64 output here>
```

> Drive is optional — if neither credential is configured, inspections still work
> but video/photo uploads are disabled. The Drive folder chip on the inspection
> page will not appear.

---

## Environment Variables

### Backend (`backend/.env`)

```env
# Database (Railway injects this automatically)
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/dealersuite_loaner

# Auth
JWT_SECRET=replace_with_a_long_random_secret
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480

# CORS
FRONTEND_URL=http://localhost:5173

# Google Drive (see setup above)
GOOGLE_SERVICE_ACCOUNT_FILE=service_account.json
# GOOGLE_SERVICE_ACCOUNT_JSON=<base64 for Railway>
GOOGLE_DRIVE_ROOT_FOLDER_NAME=DealerSuite Loaner Inspections

# App
ENVIRONMENT=development
```

---

## Railway Deployment

### Backend

Set these environment variables in Railway:

| Variable                      | Value                                                  |
|-------------------------------|--------------------------------------------------------|
| `DATABASE_URL`                | Injected automatically by Railway Postgres plugin      |
| `JWT_SECRET`                  | A long random string                                   |
| `FRONTEND_URL`                | Your Railway frontend URL                              |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Base64-encoded service account JSON                    |
| `GOOGLE_DRIVE_ROOT_FOLDER_NAME` | `DealerSuite Loaner Inspections` (or your folder name) |

Start command (in `Procfile`):
```
web: uvicorn main:app --host 0.0.0.0 --port $PORT
```

### Frontend

Build command: `npm run build`
Publish directory: `dist`

Set `VITE_API_URL` to your Railway backend URL if deploying frontend separately.

---

## API Reference

| Method | Endpoint                         | Auth     | Description                        |
|--------|----------------------------------|----------|------------------------------------|
| POST   | `/api/auth/login`                | —        | Login (returns JWT)                |
| GET    | `/api/auth/me`                   | Porter+  | Current user info                  |
| GET    | `/api/vehicles/vin/{vin}`        | Porter+  | VIN lookup for porter scan         |
| POST   | `/api/inspect/start`             | Porter+  | Start inspection + create Drive folder |
| POST   | `/api/inspect/{id}/complete`     | Porter+  | Complete inspection                |
| POST   | `/api/inspect/{id}/upload`       | Porter+  | Upload video or damage photo       |
| GET    | `/api/inspect/{id}`              | Porter+  | Inspection detail                  |
| POST   | `/api/fleet/import`              | Manager+ | Import vehicles from CSV           |
| GET    | `/api/fleet/vehicles`            | Manager+ | List fleet vehicles                |
| GET    | `/api/manager/stats`             | Manager+ | Dashboard KPI stats                |
| GET    | `/api/manager/inspections`       | Manager+ | Inspection list with filters       |
| GET    | `/api/manager/damage`            | Manager+ | Damage review queue                |
| PATCH  | `/api/manager/damage/{id}`       | Manager+ | Assign RO / update damage status   |
| GET    | `/api/manager/reports`           | Manager+ | Aggregate report stats             |

---

## Development Stages

- [x] Stage 1 — Project architecture & repository setup
- [x] Stage 2 — Backend FastAPI foundation
- [x] Stage 3 — Database models
- [x] Stage 4 — React frontend foundation
- [x] Stage 5 — VIN scanning system
- [x] Stage 6 — Fleet CSV import
- [x] Stage 7 — Manager dashboard
- [x] Stage 8 — Google Drive integration
- [x] Stage 9 — Video inspection system
- [x] Stage 10 — Settings & user management

---

## License

Proprietary — DealerSuite Apps
