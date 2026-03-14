"""
DealerSuite — DB Diagnostics
Run: railway run python backend/scripts/db_check.py
"""
import os
import psycopg2

url = os.environ["DATABASE_URL"].replace("+asyncpg","").replace("postgresql+psycopg2","postgresql")
conn = psycopg2.connect(url)
cur = conn.cursor()

print("="*60)
print("DATABASE SIZE DIAGNOSTICS")
print("="*60)

cur.execute("SELECT pg_size_pretty(pg_database_size(current_database()))")
print(f"\nTotal DB size: {cur.fetchone()[0]}")

cur.execute("""
    SELECT tablename,
           pg_size_pretty(pg_total_relation_size(quote_ident(tablename))) AS total,
           pg_size_pretty(pg_relation_size(quote_ident(tablename))) AS data
    FROM pg_tables WHERE schemaname='public'
    ORDER BY pg_total_relation_size(quote_ident(tablename)) DESC
""")
print("\nTable sizes (largest first):")
for row in cur.fetchall():
    print(f"  {row[0]:<35} {row[1]:<12} {row[2]}")

cur.execute("""
    SELECT COUNT(*) AS total,COUNT(file_data) AS with_data,
           pg_size_pretty(SUM(COALESCE(length(file_data),0))::bigint) AS bytea_size
    FROM inspection_media
""")
row = cur.fetchone()
print(f"\ninspection_media: {row[0]} rows, {row[1]} with BYTEA data, total BYTEA: {row[2]}")

cur.execute("SELECT COUNT(*) FROM inspection_media WHERE file_data IS NOT NULL AND file_url LIKE '%drive.google.com%'")
print(f"Safe to clean (Drive URL + BYTEA): {cur.fetchone()[0]}")
cur.execute("SELECT COUNT(*) FROM inspection_media WHERE file_data IS NOT NULL AND file_url LIKE '/api/media/%'")
print(f"Must keep (DB-only): {cur.fetchone()[0]}")

cur.close(); conn.close()
print("\n"+"="*60)
