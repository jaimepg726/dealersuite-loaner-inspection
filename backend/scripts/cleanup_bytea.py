"""
DealerSuite — BYTEA Cleanup
Nulls out file_data on rows that already have a Drive URL.
Dry run:  railway run python backend/scripts/cleanup_bytea.py --dry-run
Live run: railway run python backend/scripts/cleanup_bytea.py
"""
import os,sys
import psycopg2

DRY_RUN = '--dry-run' in sys.argv
url = os.environ["DATABASE_URL"].replace("+asyncpg","").replace("postgresql+psycopg2","postgresql")
conn = psycopg2.connect(url)
cur = conn.cursor()

print("="*60)
print(f"BYTEA CLEANUP {'(DRY RUN)' if DRY_RUN else '(LIVE)'}")
print("="*60)

cur.execute("SELECT pg_size_pretty(pg_total_relation_size('inspection_media'))")
print(f"\nBefore size: {cur.fetchone()[0]}")

cur.execute("""SELECT COUNT(*),pg_size_pretty(SUM(length(file_data))::bigint)
    FROM inspection_media WHERE file_data IS NOT NULL AND file_url LIKE '%drive.google.com%'""")
row = cur.fetchone()
print(f"Rows to clean (Drive URL + BYTEA): {row[0]} ({row[1]})")

cur.execute("""SELECT COUNT(*) FROM inspection_media
    WHERE file_data IS NOT NULL AND file_url NOT LIKE '%drive.google.com%'""")
print(f"Rows to preserve (DB-only): {cur.fetchone()[0]}")

if DRY_RUN:
    print("\nDRY RUN — no changes made.")
    cur.close(); conn.close(); sys.exit(0)

cur.execute("""UPDATE inspection_media SET file_data=NULL
    WHERE file_data IS NOT NULL AND file_url LIKE '%drive.google.com%'""")
print(f"\nCleaned {cur.rowcount} rows.")
conn.commit()
cur.close(); conn.close()
print("Done. Now run vacuum.py to reclaim disk space.")
print("="*60)
