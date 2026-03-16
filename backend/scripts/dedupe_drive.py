"""
DealerSuite — Deduplicate Drive Video Files
============================================
Lists all files in the DealerSuite Loaner Inspections/inspections/ Drive
folder, groups them by loaner number + inspection type + date (ignoring the
seconds-level timestamp so pairs like 165820 and 165825 are treated as the
same event), then deletes all but the LARGEST file in each group.

Usage:
    Dry run:  railway run python backend/scripts/dedupe_drive.py --dry-run
    Live run: railway run python backend/scripts/dedupe_drive.py

What it does NOT touch:
    - damage/ photos
    - Any files where there is only one copy in the group
    - The jwt / auth system

Output format:
    GROUP  M499_checkout_2026-03-16
      KEEP   M499_checkout_2026-03-16_165825.mp4  (2 147 483 bytes)  id=abc123
      DELETE M499_checkout_2026-03-16_165820.mp4  (1 048 576 bytes)  id=def456
"""
import base64
import hashlib
import os
import re
import sys
from datetime import datetime, timezone, timedelta

import psycopg2
import requests

DRY_RUN = "--dry-run" in sys.argv

DATABASE_URL = os.environ["DATABASE_URL"]
JWT_SECRET   = os.environ.get("JWT_SECRET", "")

# ── DB helpers (sync psycopg2) ────────────────────────────────────────────────

def get_db_conn():
    url = DATABASE_URL.replace("+asyncpg", "").replace("postgresql+psycopg2", "postgresql")
    return psycopg2.connect(url)


def _fernet():
    from cryptography.fernet import Fernet
    key32 = hashlib.sha256(JWT_SECRET.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key32))


def decrypt(ciphertext: str) -> str:
    return _fernet().decrypt(ciphertext.encode()).decode()


def read_setting(cur, key: str) -> str | None:
    cur.execute("SELECT value FROM app_settings WHERE key = %s", (key,))
    row = cur.fetchone()
    if not row or not row[0]:
        return None
    try:
        return decrypt(row[0])
    except Exception:
        return row[0]  # not encrypted (legacy)


# ── Token refresh ─────────────────────────────────────────────────────────────

def get_valid_access_token(cur) -> str:
    access_token  = read_setting(cur, "google_access_token")
    refresh_token = read_setting(cur, "google_refresh_token")
    expiry_str    = read_setting(cur, "google_token_expiry")

    if not access_token:
        print("ERROR: No google_access_token in settings — reconnect Drive in the dashboard.")
        sys.exit(1)

    # Check expiry and refresh if needed
    if expiry_str:
        try:
            expiry = datetime.fromisoformat(expiry_str)
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
            near_expiry = (expiry - datetime.now(timezone.utc)) < timedelta(minutes=5)
        except ValueError:
            near_expiry = False
    else:
        near_expiry = False

    if near_expiry and refresh_token:
        from config import get_settings  # only available inside Railway
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
        if resp.status_code == 200:
            access_token = resp.json()["access_token"]
            print("Token refreshed OK")
        else:
            print(f"WARNING: Token refresh failed ({resp.status_code}) — proceeding with existing token")

    return access_token


# ── Drive API helpers ─────────────────────────────────────────────────────────

DRIVE_API = "https://www.googleapis.com/drive/v3"


def list_files_in_folder(token: str, folder_id: str) -> list[dict]:
    """Return all non-trashed files in folder_id (handles pagination)."""
    files = []
    page_token = None
    headers = {"Authorization": f"Bearer {token}"}

    while True:
        params = {
            "q":        f"'{folder_id}' in parents and trashed=false and mimeType != 'application/vnd.google-apps.folder'",
            "fields":   "nextPageToken, files(id, name, size, createdTime)",
            "pageSize": 1000,
        }
        if page_token:
            params["pageToken"] = page_token

        resp = requests.get(f"{DRIVE_API}/files", headers=headers, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        files.extend(data.get("files", []))
        page_token = data.get("nextPageToken")
        if not page_token:
            break

    return files


def delete_file(token: str, file_id: str, dry_run: bool) -> bool:
    if dry_run:
        return True
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.delete(f"{DRIVE_API}/files/{file_id}", headers=headers, timeout=15)
    return resp.status_code == 204


# ── Filename parsing ──────────────────────────────────────────────────────────
# Format: {LoanerNum}_{type}_{YYYY-MM-DD}_{HHMMSS}[_suffix_NN].ext
# Group key = loaner + type + date (first 10 chars: YYYY-MM-DD)
# e.g. "M499_checkout_2026-03-16_165825.mp4"  →  "M499_checkout_2026-03-16"

_NAME_RE = re.compile(
    r"^(?P<loaner>[A-Za-z0-9]+)_(?P<itype>[A-Za-z0-9]+)_(?P<date>\d{4}-\d{2}-\d{2})_\d{6}",
    re.IGNORECASE,
)


def group_key(filename: str) -> str | None:
    m = _NAME_RE.match(filename)
    if not m:
        return None
    return f"{m.group('loaner')}_{m.group('itype')}_{m.group('date')}"


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print(f"DRIVE DEDUPLICATE {'(DRY RUN)' if DRY_RUN else '(LIVE — WILL DELETE)'}")
    print("=" * 60)

    conn = get_db_conn()
    cur  = conn.cursor()

    # Get Drive credentials and folder ID from settings
    token     = get_valid_access_token(cur)
    folder_id = read_setting(cur, "drive_inspections_folder_id")
    cur.close(); conn.close()

    if not folder_id:
        print("ERROR: drive_inspections_folder_id not found in settings — has Drive been connected?")
        sys.exit(1)

    print(f"\nListing files in inspections folder: {folder_id}")
    all_files = list_files_in_folder(token, folder_id)
    print(f"Found {len(all_files)} file(s) total\n")

    # Group by loaner+type+date
    groups: dict[str, list[dict]] = {}
    ungrouped = []
    for f in all_files:
        key = group_key(f.get("name", ""))
        if key:
            groups.setdefault(key, []).append(f)
        else:
            ungrouped.append(f)

    if ungrouped:
        print(f"Skipping {len(ungrouped)} file(s) with non-standard names:")
        for f in ungrouped:
            print(f"  SKIP  {f['name']}")
        print()

    # Find groups with duplicates
    dup_groups = {k: v for k, v in groups.items() if len(v) > 1}

    if not dup_groups:
        print("No duplicate groups found — nothing to do.")
        return

    print(f"Found {len(dup_groups)} duplicate group(s):\n")

    deleted_count = 0
    deleted_bytes = 0

    for key, files in sorted(dup_groups.items()):
        # Sort descending by size — keep the largest (best copy)
        for f in files:
            f["_size"] = int(f.get("size") or 0)
        files_sorted = sorted(files, key=lambda f: f["_size"], reverse=True)

        keeper = files_sorted[0]
        to_delete = files_sorted[1:]

        print(f"GROUP  {key}")
        print(f"  KEEP   {keeper['name']}  ({keeper['_size']:,} bytes)  id={keeper['id']}")

        for f in to_delete:
            tag = "DRY-DELETE" if DRY_RUN else "DELETE"
            ok  = delete_file(token, f["id"], DRY_RUN)
            status = "OK" if ok else "FAILED"
            print(f"  {tag} {f['name']}  ({f['_size']:,} bytes)  id={f['id']}  [{status}]")
            if ok:
                deleted_count += 1
                deleted_bytes += f["_size"]

        print()

    print("-" * 60)
    print(f"{'Would delete' if DRY_RUN else 'Deleted'}: {deleted_count} file(s), "
          f"{deleted_bytes:,} bytes freed")
    if DRY_RUN:
        print("Re-run without --dry-run to apply deletions.")
    print("=" * 60)


if __name__ == "__main__":
    main()
