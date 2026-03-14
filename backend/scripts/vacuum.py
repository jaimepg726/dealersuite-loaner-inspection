"""
DealerSuite — VACUUM FULL
Physically reclaims disk space after cleanup_bytea.py.
Run: railway run python backend/scripts/vacuum.py
"""
import os
import psycopg2

url = os.environ["DATABASE_URL"].replace("+asyncpg","").replace("postgresql+psycopg2","postgresql")
conn = psycopg2.connect(url)
conn.autocommit = True
cur = conn.cursor()

print("="*60)
print("VACUUM FULL — Reclaiming disk space")
print("="*60)

cur.execute("SELECT pg_size_pretty(pg_database_size(current_database())),pg_size_pretty(pg_total_relation_size('inspection_media'))")
row = cur.fetchone()
print(f"\nBEFORE: DB={row[0]}  inspection_media={row[1]}")

print("\nRunning VACUUM FULL ANALYZE on inspection_media (30-60s)...")
cur.execute("VACUUM FULL ANALYZE inspection_media")
print("Running VACUUM ANALYZE on full DB...")
cur.execute("VACUUM ANALYZE")

cur.execute("SELECT pg_size_pretty(pg_database_size(current_database())),pg_size_pretty(pg_total_relation_size('inspection_media'))")
row = cur.fetchone()
print(f"\nAFTER:  DB={row[0]}  inspection_media={row[1]}")

cur.close(); conn.close()
print("\nVacuum complete. Railway volume usage should drop immediately.")
print("="*60)
