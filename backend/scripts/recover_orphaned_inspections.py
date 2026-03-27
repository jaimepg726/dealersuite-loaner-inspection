"""
DealerSuite — Orphaned Inspection Recovery
==========================================
Finds inspections stuck "In Progress" that have a Drive folder linked but
no finalized InspectionMedia records, matches the best Drive video file to
each inspection, creates the media record, and marks the inspection Completed.

Usage:
    Dry run:  railway run python backend/scripts/recover_orphaned_inspections.py
    Execute:  railway run python backend/scripts/recover_orphaned_inspections.py --execute

Matching logic:
    Filename format: {Loaner}_{Type}_{YYYY-MM-DD}_{HHMMSS}.{ext}
    e.g.  M499_checkout_2026-03-09_142312.mp4

    For each orphaned inspection we build the expected prefix
      {loaner}_{type}_{date}  (using the inspection's started_at date, UTC)
    and try exact date, then ±1 day, then ±2 days (upload can lag).
    Among all matches we pick the LARGEST file (most complete upload).

Safety:
    - Never creates duplicate media records (checks by file_url)
    - Never updates inspections that already have valid media
    - Never modifies Drive files
    - Condition inspections (no loaner number) are skipped with a note
    - All DB writes are in a single transaction per inspection (rolled back on error)
"""
import argparse
import base64
import hashlib
import os
import re
import sys
from datetime import datetime, timezone, timedelta

import psycopg2
import psycopg2.extras
import requests

DRY_RUN_DEFAULT = True  # safe default; override with --execute

DATABASE_URL = os.environ.get("DATABASE_URL", "")
JWT_SECRET   = os.environ.get("JWT_SECRET", "")

DRIVE_API        = "https://www.googleapis.com/drive/v3"
DRIVE_FILE_BASE  = "https://drive.google.com/uc?id={}&export=view"
VIDEO_MIME_PREFIX = "video/"

# ── DB helpers ────────────────────────────────────────────────────────────────

def get_conn():
    url = (DATABASE_URL
           .replace("+asyncpg", "")
           .replace("postgresql+psycopg2", "postgresql")
           .replace("postgres://", "postgresql://"))
    return psycopg2.connect(url, cursor_factory=psycopg2.extras.RealDictCursor)


def _fernet():
    from cryptography.fernet import Fernet
    key32 = hashlib.sha256(JWT_SECRET.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key32))


def _decrypt(value: str) -> str:
    try:
        return _fernet().decrypt(value.encode()).decode()
    except Exception:
        return value  # not encrypted (legacy plain text)


def read_setting(cur, key: str) -> str | None:
    cur.execute("SELECT value FROM app_settings WHERE key = %s", (key,))
    row = cur.fetchone()
    if not row or not row["value"]:
        return None
    return _decrypt(row["value"])

# ── Drive helpers ─────────────────────────────────────────────────────────────

def get_access_token(cur) -> str:
    """Return a valid Drive access token, refreshing if near expiry."""
    access_token  = read_setting(cur, "google_access_token")
    refresh_token = read_setting(cur, "google_refresh_token")
    expiry_str    = read_setting(cur, "google_token_expiry")

    if not access_token:
        print("ERROR: No Drive token — reconnect Drive in manager settings.", file=sys.stderr)
        sys.exit(1)

    near_expiry = False
    if expiry_str:
        try:
            expiry = datetime.fromisoformat(expiry_str)
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
            near_expiry = (expiry - datetime.now(timezone.utc)) < timedelta(minutes=5)
        except ValueError:
            pass

    if near_expiry and refresh_token:
        from config import get_settings
        cfg = get_settings()
        resp = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id":     cfg.google_client_id,
                "client_secret": cfg.google_client_secret,
                "refresh_token": refresh_token,
                "grant_type":    "refresh_token",
            },
            timeout=15,
        )
        if resp.ok:
            access_token = resp.json()["access_token"]
            print("Drive: token refreshed.")
        else:
            print(f"WARN: token refresh failed ({resp.status_code}) — continuing with old token.")

    return access_token


def list_drive_videos(token: str, folder_id: str) -> list[dict]:
    """Return all video files in a Drive folder (handles pagination)."""
    files      = []
    page_token = None
    while True:
        params = {
            "q":       (f"'{folder_id}' in parents "
                        "and mimeType contains 'video/' "
                        "and trashed=false"),
            "fields":  "nextPageToken,files(id,name,size,createdTime,mimeType)",
            "pageSize": "1000",
        }
        if page_token:
            params["pageToken"] = page_token

        r = requests.get(
            f"{DRIVE_API}/files",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        files.extend(data.get("files", []))
        page_token = data.get("nextPageToken")
        if not page_token:
            break
    return files


# ── Filename matching ─────────────────────────────────────────────────────────

def _sanitize(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", s or "")


def find_best_match(
    drive_files: list[dict],
    loaner:      str,
    insp_type:   str,
    started_at:  datetime,
) -> dict | None:
    """
    Try prefix match for exact date, then ±1 day, then ±2 days.
    Among matches pick the LARGEST file (most complete upload).
    Skip files with '_damage_' in the name (those are photo uploads).
    """
    safe_loaner = _sanitize(loaner)
    safe_type   = _sanitize(insp_type.lower())

    for delta in (0, 1, -1, 2, -2):
        target_date = (started_at + timedelta(days=delta)).strftime("%Y-%m-%d")
        prefix      = f"{safe_loaner}_{safe_type}_{target_date}".lower()
        candidates  = [
            f for f in drive_files
            if f["name"].lower().startswith(prefix)
            and "_damage_" not in f["name"].lower()
        ]
        if candidates:
            return max(
                candidates,
                key=lambda f: (int(f.get("size") or 0), f.get("createdTime", "")),
            )
    return None


# ── Main ──────────────────────────────────────────────────────────────────────

def run(execute: bool) -> None:
    mode = "EXECUTE" if execute else "DRY RUN"
    print(f"\n{'═'*55}")
    print(f"  DealerSuite Orphaned Inspection Recovery — {mode}")
    print(f"{'═'*55}\n")

    stats = {
        "scanned":  0,
        "matched":  0,
        "recovered": 0,
        "skipped":  0,
        "errors":   0,
    }

    conn = get_conn()
    try:
        cur = conn.cursor()

        # ── Drive auth + folder IDs ───────────────────────────────────────────
        token = get_access_token(cur)

        insp_folder_id = read_setting(cur, "drive_insp_folder_id")
        if not insp_folder_id:
            print("ERROR: drive_insp_folder_id not found — ensure Drive is connected.", file=sys.stderr)
            return

        print(f"Listing videos in Drive inspections folder ({insp_folder_id})…")
        drive_videos = list_drive_videos(token, insp_folder_id)
        print(f"Found {len(drive_videos)} video files in Drive.\n")

        # Pre-build URL set for quick idempotency checks
        drive_url_map = {DRIVE_FILE_BASE.format(f["id"]): f for f in drive_videos}

        # ── Fetch orphaned inspections ────────────────────────────────────────
        # Criteria:
        #   • status = 'In Progress'
        #   • drive_folder_id IS NOT NULL  (Drive was live when started)
        #   • inspection_type != 'Condition'  (condition uses different folder + filename)
        #   • no finalized InspectionMedia rows (none, or all are 'pending')
        cur.execute("""
            SELECT
                i.id,
                i.inspection_type,
                i.started_at,
                i.vehicle_id,
                v.loaner_number,
                (
                    SELECT COUNT(*) FROM inspection_media m
                    WHERE m.inspection_id = i.id
                      AND m.file_url NOT IN ('pending', '')
                      AND m.file_url IS NOT NULL
                ) AS finalized_media_count
            FROM inspections i
            LEFT JOIN vehicles v ON v.id = i.vehicle_id
            WHERE i.status      = 'In Progress'
              AND i.drive_folder_id IS NOT NULL
              AND i.inspection_type != 'Condition'
            ORDER BY i.id
        """)
        rows = cur.fetchall()
        orphaned = [r for r in rows if r["finalized_media_count"] == 0]

        stats["scanned"] = len(orphaned)
        print(f"Orphaned inspections (In Progress, no finalized media): {len(orphaned)}\n")

        # ── Process each ─────────────────────────────────────────────────────
        for row in orphaned:
            insp_id   = row["id"]
            loaner    = row["loaner_number"]
            insp_type = row["inspection_type"]
            started   = row["started_at"]

            if started.tzinfo is None:
                started = started.replace(tzinfo=timezone.utc)

            if not loaner:
                print(f"  Insp #{insp_id}  ({insp_type})  — no loaner number, skipping.")
                stats["skipped"] += 1
                continue

            winner = find_best_match(drive_videos, loaner, insp_type, started)

            if not winner:
                print(
                    f"  Insp #{insp_id}  Loaner {loaner:<8}  {insp_type:<12}"
                    f" — no Drive file matched."
                )
                stats["skipped"] += 1
                continue

            stats["matched"] += 1
            drive_url = DRIVE_FILE_BASE.format(winner["id"])
            size_mb   = int(winner.get("size") or 0) / 1_048_576

            print(
                f"  Insp #{insp_id}  Loaner {loaner:<8}  {insp_type:<12}"
                f" → '{winner['name']}'  ({size_mb:.1f} MB)"
            )

            if not execute:
                print("    [DRY RUN] Would create InspectionMedia + mark Completed.\n")
                continue

            try:
                # Idempotency: skip if this Drive URL already linked
                cur.execute(
                    "SELECT id FROM inspection_media WHERE inspection_id = %s AND file_url = %s",
                    (insp_id, drive_url),
                )
                if cur.fetchone():
                    print("    Already linked — skipping.\n")
                    stats["skipped"] += 1
                    continue

                # Delete any pending orphan records for this inspection
                cur.execute(
                    "DELETE FROM inspection_media WHERE inspection_id = %s AND file_url = 'pending'",
                    (insp_id,),
                )

                # Insert finalized media record
                cur.execute(
                    """
                    INSERT INTO inspection_media
                        (inspection_id, file_url, media_type, mime_type, created_at)
                    VALUES (%s, %s, 'video', %s, NOW())
                    """,
                    (insp_id, drive_url, winner.get("mimeType", "video/mp4")),
                )

                # Mark inspection Completed
                cur.execute(
                    """
                    UPDATE inspections
                    SET status = 'Completed', completed_at = NOW()
                    WHERE id = %s
                    """,
                    (insp_id,),
                )

                conn.commit()
                stats["recovered"] += 1
                print(f"    ✓ Recovered — {drive_url}\n")

            except Exception as exc:
                conn.rollback()
                print(f"    ERROR for insp #{insp_id}: {exc}\n", file=sys.stderr)
                stats["errors"] += 1

    finally:
        conn.close()

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"\n{'═'*55}")
    print(f"  {mode} SUMMARY")
    print(f"{'═'*55}")
    print(f"  Orphaned inspections scanned : {stats['scanned']}")
    print(f"  Matched to Drive video       : {stats['matched']}")
    print(f"  Recovered (DB updated)       : {stats['recovered']}")
    print(f"  Skipped                      : {stats['skipped']}")
    print(f"  Errors                       : {stats['errors']}")
    print()

    if not execute:
        print("  ⚠  This was a DRY RUN — no changes were made.")
        print("     Re-run with --execute to apply.\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Recover orphaned In Progress inspections by linking Drive videos."
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Apply changes to DB (default: dry run only)",
    )
    args = parser.parse_args()

    # Allow running locally with a .env file
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass

    # Add backend dir to path so config/models are importable when running locally
    _here = os.path.dirname(os.path.abspath(__file__))
    _backend = os.path.dirname(_here)
    if _backend not in sys.path:
        sys.path.insert(0, _backend)

    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not set.", file=sys.stderr)
        sys.exit(1)

    run(execute=args.execute)
