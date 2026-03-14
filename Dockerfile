# ── DealerSuite Loaner Inspection — Multi-stage Dockerfile ──────────────────
#
# Stage 1 (frontend-build): node:18-alpine → builds the Vite SPA → dist/
# Stage 2 (runtime):        python:3.11-slim → runs FastAPI via gunicorn
#
# Single gunicorn worker keeps RAM ≤ 512 MB on Railway Hobby plan.
# Railway injects PORT at runtime.

# ── Stage 1: Build React frontend ───────────────────────────────────────────
FROM node:18-alpine AS frontend-build

WORKDIR /app

# Install deps first (layer-cached unless package.json changes)
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci --prefer-offline

# Copy source and build
COPY frontend/ ./frontend/
RUN cd frontend && npm run build
# Produces /app/frontend/dist/


# ── Stage 2: Python runtime ──────────────────────────────────────────────────
FROM python:3.11-slim

# Install only strictly required system packages
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

# Install Python deps (layer-cached unless requirements.txt changes)
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./

# Copy built frontend dist into the location FastAPI expects
COPY --from=frontend-build /app/frontend/dist ./frontend_dist

# Ensure Python output is never buffered — all logs visible in Railway
ENV PYTHONUNBUFFERED=1

# Railway uses this to route healthchecks and inject PORT
EXPOSE 8000

# Single worker preserves RAM. Railway overrides via startCommand in railway.toml.
CMD ["sh", "-c", "gunicorn main:app -w 1 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:${PORT:-8000}"]
