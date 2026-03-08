"""
DealerSuite Loaner Inspection — FastAPI Entry Point

Production note:
  The React frontend is built into backend/frontend_dist/ by the Railway
  build command. FastAPI mounts that directory and falls back to index.html
  for all non-API routes so the SPA router works correctly.
"""

from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from config import get_settings
from database import engine, Base

# Route modules
from routes.auth     import router as auth_router
from routes.vehicles import router as vehicles_router
from routes.inspect  import router as inspect_router
from routes.fleet    import router as fleet_router
from routes.manager  import router as manager_router

settings = get_settings()

# Path to the pre-built React app (populated during Railway build step)
STATIC_DIR = Path(__file__).parent / "frontend_dist"


# ---------------------------------------------------------------------------
# Lifespan — startup / shutdown
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Development only: auto-create tables without a migration step
    if settings.environment == "development":
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Loaner vehicle damage inspection system for automotive dealerships.",
    lifespan=lifespan,
    # Hide docs in production
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url=None,
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,
        "http://localhost:5173",
        "http://localhost:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers  (all prefixed /api — never collide with SPA routes)
# ---------------------------------------------------------------------------
app.include_router(auth_router,     prefix="/api/auth",     tags=["auth"])
app.include_router(vehicles_router, prefix="/api/vehicles", tags=["vehicles"])
app.include_router(inspect_router,  prefix="/api/inspect",  tags=["inspect"])
app.include_router(fleet_router,    prefix="/api/fleet",    tags=["fleet"])
app.include_router(manager_router,  prefix="/api/manager",  tags=["manager"])


# ---------------------------------------------------------------------------
# System endpoints (defined before the SPA catch-all)
# ---------------------------------------------------------------------------
@app.get("/health", tags=["system"])
async def health_check():
    return {
        "status": "ok",
        "app": settings.app_name,
        "version": "1.0.0",
        "environment": settings.environment,
    }


# ---------------------------------------------------------------------------
# Serve React SPA (production only — when frontend_dist/ exists)
# ---------------------------------------------------------------------------
if STATIC_DIR.exists():
    # Serve hashed JS/CSS assets — Vite puts them in assets/
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    # Serve any other static files in the dist root (icons, manifest.json, etc.)
    app.mount("/icons",  StaticFiles(directory=STATIC_DIR / "icons"),  name="icons")

    @app.get("/favicon.ico", include_in_schema=False)
    async def favicon():
        return FileResponse(STATIC_DIR / "favicon.ico")

    @app.get("/manifest.webmanifest", include_in_schema=False)
    async def manifest():
        f = STATIC_DIR / "manifest.webmanifest"
        if f.exists():
            return FileResponse(f, media_type="application/manifest+json")
        return FileResponse(STATIC_DIR / "manifest.json", media_type="application/manifest+json")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str, request: Request):
        """
        SPA fallback — return index.html for every route that is not /api/*.
        Allows the React Router to handle client-side navigation.
        """
        return FileResponse(STATIC_DIR / "index.html")

else:
    # Local dev: no static dir — just return API running message
    @app.get("/", tags=["system"])
    async def root():
        return {"message": f"{settings.app_name} API is running. "
                           "Frontend served separately on port 5173."}
