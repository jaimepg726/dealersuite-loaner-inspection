# DealerSuite Loaner Inspection — Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        CLIENT                            │
│   iPad / iPhone / Android / Desktop Browser              │
│                                                          │
│   React 18 + Vite PWA                                    │
│   ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│   │  Porter UI   │  │  VIN Scanner │  │  Video Cam  │  │
│   │  (simple)    │  │  (ZXing)     │  │  (MediaAPI) │  │
│   └──────────────┘  └──────────────┘  └─────────────┘  │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTPS / REST API
                            │
┌───────────────────────────▼─────────────────────────────┐
│                       BACKEND                            │
│              FastAPI (Python) on Railway                 │
│                                                          │
│   ┌───────────┐  ┌───────────┐  ┌──────────────────┐   │
│   │  /auth    │  │ /vehicles │  │   /inspect       │   │
│   │  JWT      │  │ fleet CSV │  │   media upload   │   │
│   └───────────┘  └───────────┘  └──────────────────┘   │
│                                                          │
│   ┌─────────────────────────────────────────────────┐   │
│   │            google_drive.py service               │   │
│   │    auto-creates folders, uploads media           │   │
│   └─────────────────────────────────────────────────┘   │
└──────────────┬──────────────────────────┬───────────────┘
               │                          │
┌──────────────▼──────┐     ┌─────────────▼──────────────┐
│     PostgreSQL       │     │       Google Drive          │
│     (Railway)        │     │                            │
│                     │     │  DealerSuite Loaner         │
│  vehicles           │     │  └─ Loaner_M499             │
│  inspections        │     │     └─ VIN_WMW...           │
│  damages            │     │        └─ 2026-03-07_Out    │
│  users              │     │           ├─ video.mp4      │
│                     │     │           └─ photo_1.jpg    │
└─────────────────────┘     └────────────────────────────┘
```

## Porter Workflow

```
Open App (home screen icon)
        ↓
    Login screen (once per shift via JWT — 8hr token)
        ↓
    HOME — big "Start Inspection" button
        ↓
    SCAN VIN
    ┌─── Barcode scan (ZXing)
    ├─── Camera OCR scan
    └─── Manual entry (fallback)
        ↓
    SELECT Inspection Type
    ┌─── Checkout
    └─── Check-in
        ↓
    VIDEO WALKROUND
    • Tap REC → walk around vehicle
    • Tap 📷 for damage photos during recording
    • Tap STOP
        ↓
    Auto-upload to Google Drive
        ↓
    Confirmation screen ✅
```

## Google Drive Folder Structure

```
DealerSuite Loaner Inspections/
└── Loaner_M499/
    └── VIN_WMW23GD0XP2R12345/
        ├── 2026-03-07_Checkout/
        │   ├── video.mp4
        │   ├── photo_1.jpg
        │   └── photo_2.jpg
        └── 2026-03-07_Checkin/
            ├── video.mp4
            └── photo_1.jpg
```

## JWT Auth Strategy

- Porters: 8-hour tokens (full shift access, login once)
- Managers: 8-hour tokens with `role: manager` claim
- Token stored in `localStorage`
- All API routes protected except `/health` and `/api/auth/login`

## CSV Import (TSD Dealer format)

Required columns: `Loaner_Number`, `VIN`, `Year`, `Make`, `Model`, `Plate`, `Mileage`, `Status`, `Vehicle_Type`

Rules:
- Skip rows where `Status == "Retired"`
- Upsert on `VIN` (update if exists, insert if new)
- Log import results (added / updated / skipped)
