from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes_health import router as health_router
from app.api.routes_history import router as history_router
from app.api.routes_jobs import router as jobs_router
from app.api.routes_fs import router as fs_router
from app.api.routes_providers import router as providers_router
from app.core.config import settings
from app.core.logging import setup_logging

setup_logging()

app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://tauri.localhost",
        "https://tauri.localhost",
        "tauri://localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(jobs_router)
app.include_router(providers_router)
app.include_router(history_router)
app.include_router(fs_router)

if settings.output_dir.exists():
    app.mount("/static/outputs", StaticFiles(directory=str(settings.output_dir.resolve())), name="outputs")


@app.get("/")
def root() -> dict:
    return {"name": settings.app_name, "docs": "/docs"}
