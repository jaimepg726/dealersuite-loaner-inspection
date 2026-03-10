"""
DealerSuite Loaner Inspection — FastAPI Entry Point
"""

from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.exceptions import RequestValidationError

from config import get_settings
from database import engine, Base

# Route modules
from routes.auth     import router as auth_router
from routes.vehicles import router as vehicles_router
from routes.inspect  import router as inspect_router
from routes.fleet    import router as fleet_router
from routes.manager  import router as manager_router
from routes.loaners  import router as loaners_router
from routes.google_oauth import router as google_oauth_router

settings = get_settings()
STATIC_DIR = Path(__file__).parent / "frontend_dist"

@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.environment == "development":
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()

app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan,
    docs_url="/docs" if settings.environment != "production" else None, redoc_url=None)

app.add_middleware(CORSMiddleware, allow_origins=[settings.frontend_url,"http://localhost:5173","http://localhost:4173"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# ── Global error handlers (Step 55) ──────────────────────────────────────────

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "code": "VALIDATION_ERROR"},
    )

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    import logging
    logging.getLogger(__name__).exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "code": "INTERNAL_ERROR"},
    )

app.include_router(auth_router,     prefix="/api/auth",     tags=["auth"])
app.include_router(vehicles_router, prefix="/api/vehicles", tags=["vehicles"])
app.include_router(inspect_router,  prefix="/api/inspect",  tags=["inspect"])
app.include_router(fleet_router,    prefix="/api/fleet",    tags=["fleet"])
app.include_router(manager_router,  prefix="/api/manager",  tags=["manager"])
app.include_router(loaners_router,  prefix="/api/loaners",  tags=["loaners"])
app.include_router(google_oauth_router, prefix="/api/auth/google", tags=["google-oauth"])

# ── Health check (Step 60) ────────────────────────────────────────────────────

@app.get("/health", tags=["system"])
async def health_check():
    from database import AsyncSessionLocal
    from sqlalchemy import text

    # Check DB connectivity
    db_status = "unknown"
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception:
        db_status = "error"

    # Check storage backend
    storage_status = "local"
    try:
        from storage import GoogleDriveBackend
        async with AsyncSessionLocal() as db:
            drive = GoogleDriveBackend(db)
            if await drive.is_available():
                storage_status = "drive"
    except Exception:
        pass

    return {
        "status": "ok",
        "app": settings.app_name,
        "version": "1.0.0",
        "db": db_status,
        "storage": storage_status,
        "environment": settings.environment,
    }

if STATIC_DIR.exists():
    _assets = STATIC_DIR / "assets"
    if _assets.exists(): app.mount("/assets", StaticFiles(directory=_assets), name="assets")
    _icons = STATIC_DIR / "icons"
    if _icons.exists(): app.mount("/icons", StaticFiles(directory=_icons), name="icons")
    @app.get("/favicon.ico", include_in_schema=False)
    async def favicon(): return FileResponse(STATIC_DIR / "favicon.ico")
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str, request: Request): return FileResponse(STATIC_DIR / "index.html")
else:
    @app.get("/", tags=["system"])
    async def root(): return {"message":f"{settings.app_name} API working. Frontend on port 5173."}
