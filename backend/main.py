import sentry_sdk
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from backend.config import settings
from backend.core.middleware import TenantMiddleware
from backend.api.v1.router import api_router
from backend.db.base import engine, Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    if settings.APP_ENV == "production" and settings.SENTRY_DSN:
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.celery import CeleryIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            integrations=[FastApiIntegration(), CeleryIntegration(), SqlalchemyIntegration()],
            traces_sample_rate=0.1,
            environment=settings.APP_ENV,
            release=settings.APP_VERSION,
        )

    # Ensure local storage dir exists
    if settings.STORAGE_BACKEND == "local":
        Path(settings.LOCAL_STORAGE_PATH).mkdir(parents=True, exist_ok=True)

    yield
    # Shutdown: close DB pool
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/docs" if settings.APP_ENV == "development" else None,
    redoc_url=None,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Tenant isolation (must be after CORS)
app.add_middleware(TenantMiddleware)

# Serve local uploaded files in dev
if settings.STORAGE_BACKEND == "local":
    Path(settings.LOCAL_STORAGE_PATH).mkdir(parents=True, exist_ok=True)
    app.mount("/static", StaticFiles(directory=settings.LOCAL_STORAGE_PATH), name="static")

# All API routes
app.include_router(api_router, prefix="/api/v1")


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok", "version": settings.APP_VERSION, "env": settings.APP_ENV}
