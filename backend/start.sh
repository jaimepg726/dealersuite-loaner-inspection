#!/bin/sh
# ── DealerSuite Loaner Inspection — Container startup script ───────────────────
#
# Order of operations:
#   0. Wait for Postgres to be ready (handles Railway recovery mode)
#   1. Run Alembic migrations (idempotent — safe on every deploy)
#   2. Seed the default admin + manager accounts (skips if they already exist)
#   3. Start the FastAPI/uvicorn server

set -e

echo "=== DealerSuite Loaner Inspection — startup ==="

echo "[0/3] Waiting for Postgres..."
MAX_TRIES=15
TRIES=0
until python -c "
import os, psycopg2, sys
try:
    psycopg2.connect(os.environ['DATABASE_URL'].replace('+asyncpg','').replace('postgresql+psycopg2','postgresql'))
    print('DB ready')
except Exception as e:
    print('DB not ready:', e)
    sys.exit(1)
" 2>&1; do
  TRIES=$((TRIES+1))
  if [ "$TRIES" -ge "$MAX_TRIES" ]; then
    echo "ERROR: Postgres never became ready after $MAX_TRIES attempts. Aborting."
    exit 1
  fi
  echo "  Retrying in 5s... (attempt $TRIES/$MAX_TRIES)"
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
