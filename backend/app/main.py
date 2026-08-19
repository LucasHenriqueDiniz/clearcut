from fastapi import FastAPI
import logging
from pathlib import Path
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes_health import router as health_router
from app.api.routes_history import router as history_router
from app.api.routes_jobs import router as jobs_router
from app.api.routes_fs import router as fs_router
from app.api.routes_models import router as models_router
from app.api.routes_presets import router as presets_router
from app.api.routes_providers import router as providers_router
from app.api.routes_watch_folders import router as watch_folders_router
from app.core.config import settings
from app.core.logging import setup_logging
from app.services.model_storage_service import model_storage_service
from app.services.watch_folder_service import watch_folder_service
from app.storage.history import history_store
from app.storage.watch_folder_store import watch_folder_store
from app.utils.paths import output_path_guard

setup_logging()
logger = logging.getLogger(__name__)

app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost",
        "http://127.0.0.1",
        "http://tauri.localhost",
        "https://tauri.localhost",
        "tauri://localhost",
    ],
    allow_origin_regex=r"^(tauri://localhost|https?://(tauri\.localhost|localhost|127\.0\.0\.1)(:\d+)?)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(jobs_router)
app.include_router(providers_router)
app.include_router(presets_router)
app.include_router(models_router)
app.include_router(watch_folders_router)
app.include_router(history_router)
app.include_router(fs_router)

if settings.output_dir.exists():
    app.mount("/static/outputs", StaticFiles(directory=str(settings.output_dir.resolve())), name="outputs")


def _seed_allowed_output_roots() -> None:
    """Re-allow output folders this app wrote to in previous sessions.

    The guard learns custom destinations as files are written, so without
    this a restart would reject downloads of older results that live outside
    the default output folder.
    """
    for item in watch_folder_store.list():
        output_path_guard.register_root(item.output_folder)
    for row in history_store.list(limit=1000):
        output_path = row.get("output_path")
        if output_path:
            output_path_guard.register_root(Path(output_path).parent)


@app.on_event("startup")
def start_background_services() -> None:
    model_storage_service.load_persisted_root()
    _seed_allowed_output_roots()
    watch_folder_service.start()


@app.on_event("shutdown")
def stop_background_services() -> None:
    watch_folder_service.stop()


@app.get("/")
def root() -> dict:
    return {"name": settings.app_name, "docs": "/docs"}
