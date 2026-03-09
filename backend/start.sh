#!/bin/sh
# ── DealerSuite Loaner Inspection — Container startup script ─────────────────
#
# Order of operations:
#   1. Run Alembic migrations (idempotent — safe on every deploy)
#   2. Seed the default admin + manager accounts (skips if they already exist)
#   3. Start the FastAPI/uvicorn server
#
# This script is called by railway.toml startCommand so it runs inside the
# Railway container with all environment variables already injected.

set -e   # exit immediately on any error

echo "=== DealerSuite Loaner Inspection — startup ==="

echo "[1/3] Running Alembic migrations..."
python -m alembic upgrade head
echo "      Migrations complete."

echo "[2/3] Seeding default users..."
python seed.py
echo "      Seed complete."

echo "[3/3] Starting uvicorn..."
exec python -m uvicorn main:app --host 0.0.0.0 --port 8000
