#!/bin/sh
# DealerSuite Loaner Inspection — Container startup
# 0. Wait for Postgres (up to 5 min — handles Railway recovery mode)
# 1. Run Alembic migrations
# 2. Seed default users
# 3. Start uvicorn

set -e

echo "=== DealerSuite Loaner Inspection — startup ==="

echo "[0/3] Waiting for Postgres (max 5 min)..."
MAX_TRIES=60
TRIES=0
until python -c "
import os, psycopg2, sys
url = os.environ.get('DATABASE_URL','')
url = url.replace('+asyncpg','').replace('postgresql+psycopg2','postgresql')
try:
    conn = psycopg2.connect(url)
    conn.close()
    print('DB ready')
except Exception as e:
    print('Not ready:', e)
    sys.exit(1)
" 2>&1; do
  TRIES=$((TRIES+1))
  if [ "$TRIES" -ge "$MAX_TRIES" ]; then
    echo "ERROR: Postgres not ready after $MAX_TRIES attempts. Aborting."
    exit 1
  fi
  echo "  Waiting 5s... (attempt $TRIES/$MAX_TRIES)"
  sleep 5
done
echo " Postgres ready."

echo "[1/3] Running Alembic migrations..."
python -m alembic upgrade head
echo " Migrations complete."

echo "[2/3] Seeding default users..."
python seed.py
echo " Seed complete."

echo "[3/3] Starting uvicorn..."
exec python -m uvicorn main:app --host 0.0.0.0 --port 8000
