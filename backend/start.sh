#!/bin/sh
# ── DealerSuite Loaner Inspection — Container startup script ─────────────────
#
# Order of operations:
#   1. Run Alembic migrations (idempotent — safe on every deploy)
#   2. Seed the default admin + manager accounts (skips if they already exist)
#   3. Start the FastAPI server via gunicorn (single worker, low RAM)
#
# Railway injects PORT and DATABASE_URL automatically.

set -e   # exit immediately on any error

echo "=== DealerSuite Loaner Inspection — startup ==="

echo "[1/3] Running Alembic migrations..."
python -m alembic upgrade head
echo "      Migrations complete."

echo "[2/3] Seeding default users..."
python seed.py
echo "      Seed complete."

echo "[3/3] Starting gunicorn (1 worker)..."
exec gunicorn main:app -w 1 -k uvicorn.workers.UvicornWorker --bind "0.0.0.0:${PORT:-8000}" --timeout 60 --worker-tmp-dir /dev/shm
