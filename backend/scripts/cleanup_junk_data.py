"""
DealerSuite — One-Time Junk Data Cleanup
=========================================
Removes two categories of data that pollute the system:

  A. Junk inspections — "In Progress" rows with no finalized media.
     These are page-mount artifacts created before any real recording happened.
     "Finalized media" means an InspectionMedia row whose file_url is NOT
     'pending' or empty.  Cascades automatically remove any orphaned
     pending InspectionMedia stubs for the deleted inspection.

  B. All damage records — confirmed manual/test data; wipe for a clean start.
     NOTE: deleting an inspection (step A) already cascades its damage rows,
     so only standalone damage rows on kept inspections are removed here.

Usage:
    Dry run:  railway run python backend/scripts/cleanup_junk_data.py
    Execute:  railway run python backend/scripts/cleanup_junk_data.py --execute

Safety:
    - Defaults to dry-run (no DB writes without --execute)
    - Shows exact counts before any delete
    - Does NOT delete inspections that have valid finalized media
    - Does NOT delete or modify any Google Drive files
    - Does NOT touch "Completed" inspections (only "In Progress" junk is removed)
    - All deletes run in a single transaction; rolled back on any error
    - Idempotent: safe to run multiple times
"""
import argparse
import base64
import hashlib
import os
import sys
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras

# Prefer public URL when running locally (internal host not reachable outside Railway)
DATABASE_URL = os.environ.get("DATABASE_PUBLIC_URL") or os.environ.get("DATABASE_URL", "")
JWT_SECRET   = os.environ.get("JWT_SECRET", "")

# ── DB helpers ────────────────────────────────────────────────────────────────

def get_conn():
    url = (DATABASE_URL
           .replace("+asyncpg", "")
           .replace("postgresql+psycopg2", "postgresql")
           .replace("postgres://", "postgresql://"))
    return psycopg2.connect(url, cursor_factory=psycopg2.extras.RealDictCursor)


# ── Query helpers ─────────────────────────────────────────────────────────────

# Inspections that are "In Progress" AND have zero finalized media records.
# Finalized = file_url is not NULL, not 'pending', not empty string.
JUNK_INSPECTION_QUERY = """
    SELECT
        i.id,
        i.inspection_type,
        i.started_at,
        i.inspector_name,
        v.loaner_number,
        (
            SELECT COUNT(*) FROM inspection_media m
            WHERE m.inspection_id = i.id
              AND m.file_url IS NOT NULL
              AND m.file_url NOT IN ('pending', '')
        ) AS finalized_media_count,
        (
            SELECT COUNT(*) FROM inspection_media m
            WHERE m.inspection_id = i.id
        ) AS total_media_count
    FROM inspections i
    LEFT JOIN vehicles v ON v.id = i.vehicle_id
    WHERE i.status = 'In Progress'
    ORDER BY i.started_at DESC
"""

COMPLETED_NO_MEDIA_QUERY = """
    SELECT COUNT(*) AS cnt
    FROM inspections i
    WHERE i.status = 'Completed'
      AND NOT EXISTS (
          SELECT 1 FROM inspection_media m
          WHERE m.inspection_id = i.id
            AND m.file_url IS NOT NULL
            AND m.file_url NOT IN ('pending', '')
      )
"""

DAMAGE_COUNT_QUERY = """
    SELECT COUNT(*) AS cnt FROM damages
"""


# ── Main ──────────────────────────────────────────────────────────────────────

def run(execute: bool) -> None:
    mode = "EXECUTE" if execute else "DRY RUN"
    print(f"\n{'═'*60}")
    print(f"  DealerSuite One-Time Junk Data Cleanup — {mode}")
    print(f"{'═'*60}\n")

    conn = get_conn()
    try:
        cur = conn.cursor()

        # ── A: Junk inspection analysis ───────────────────────────────────────
        print("Analysing In Progress inspections…")
        cur.execute(JUNK_INSPECTION_QUERY)
        all_in_progress = cur.fetchall()
        junk_rows = [r for r in all_in_progress if r["finalized_media_count"] == 0]

        print(f"  Total 'In Progress' rows    : {len(all_in_progress)}")
        print(f"  With zero finalized media   : {len(junk_rows)}  ← will be DELETED")
        print(f"  With finalized media        : {len(all_in_progress) - len(junk_rows)}  ← kept\n")

        if junk_rows:
            print("  Junk inspections to delete:")
            for r in junk_rows[:30]:
                loaner = r["loaner_number"] or "(no loaner)"
                started = r["started_at"].strftime("%Y-%m-%d %H:%M") if r["started_at"] else "?"
                print(f"    id={r['id']:>6}  {r['inspection_type']:<12}  {loaner:<10}  {r['inspector_name'] or ''}  started={started}  media_stubs={r['total_media_count']}")
            if len(junk_rows) > 30:
                print(f"    … and {len(junk_rows) - 30} more")
            print()

        # ── Review: Completed with no media (not deleted — shown for awareness) ──
        cur.execute(COMPLETED_NO_MEDIA_QUERY)
        completed_no_media = cur.fetchone()["cnt"]
        print(f"  Completed with no media     : {completed_no_media}  ← NOT deleted (review manually)\n")

        # ── B: Damage records ─────────────────────────────────────────────────
        cur.execute(DAMAGE_COUNT_QUERY)
        total_damages = cur.fetchone()["cnt"]
        print(f"  Total damage records        : {total_damages}  ← will ALL be DELETED\n")

        # ── Summary ───────────────────────────────────────────────────────────
        print(f"{'─'*60}")
        print(f"  Will delete {len(junk_rows)} junk inspections (+ their media stubs via CASCADE)")
        print(f"  Will delete {total_damages} damage records")
        print(f"{'─'*60}\n")

        if not execute:
            print("  ⚠  DRY RUN — no changes were made.")
            print("     Re-run with --execute to apply.\n")
            return

        if len(junk_rows) == 0 and total_damages == 0:
            print("  Nothing to delete — database is already clean.\n")
            return

        # ── Execute deletes in a single transaction ────────────────────────────
        print("Executing deletes…")
        try:
            junk_ids = [r["id"] for r in junk_rows]

            deleted_inspections = 0
            if junk_ids:
                cur.execute(
                    "DELETE FROM inspections WHERE id = ANY(%s)",
                    (junk_ids,),
                )
                deleted_inspections = cur.rowcount

            # Delete all damage records (on kept inspections; cascade already
            # removed damage rows belonging to deleted inspections above).
            cur.execute("DELETE FROM damages")
            deleted_damages = cur.rowcount

            conn.commit()

            print(f"\n  ✓ Deleted {deleted_inspections} junk inspections (with cascaded media stubs)")
            print(f"  ✓ Deleted {deleted_damages} damage records")
            print()

        except Exception as exc:
            conn.rollback()
            print(f"\n  ERROR — transaction rolled back: {exc}", file=sys.stderr)
            sys.exit(1)

    finally:
        conn.close()

    print(f"{'═'*60}")
    print(f"  Cleanup complete.")
    print(f"{'═'*60}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="One-time cleanup of junk inspections and test damage data."
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Apply deletes (default: dry run only)",
    )
    args = parser.parse_args()

    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass

    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not set.", file=sys.stderr)
        sys.exit(1)

    run(execute=args.execute)
