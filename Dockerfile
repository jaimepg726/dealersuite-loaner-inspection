# ── DealerSuite Loaner Inspection — Multi-stage Dockerfile ──────────────────
#
# Stage 1 (frontend-build): Node 20 → builds the React / Vite SPA
# Stage 2 (runtime):        Python 3.11 slim → runs FastAPI + serves the SPA
#
# Railway injects the PORT environment variable at runtime.

# ── Stage 1: Build React frontend ───────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

# Install deps first (layer-cached unless package.json changes)
COPY frontend/package*.json ./
RUN npm ci

# Copy source and build
COPY frontend/ ./
RUN npm run build
# Produces /app/frontend/dist/


# ── Stage 2: Python runtime ──────────────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app/backend

# Install Python deps (layer-cached unless requirements.txt changes)
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./

# Copy built frontend dist into the location FastAPI expects
COPY --from=frontend-build /app/frontend/dist ./frontend_dist

# Ensure Python output (stdout/stderr) is never buffered — all logs are visible in Railway
ENV PYTHONUNBUFFERED=1

# Tell Railway/Docker which port this service listens on.
# Railway uses this to inject PORT and route healthchecks correctly.
EXPOSE 8000

# Railway assigns PORT at runtime; uvicorn must bind to it.
# CMD is overridden by railway.toml startCommand, but keep a sensible default.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
