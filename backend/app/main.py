from pathlib import Path
from fastapi import FastAPI
import logging
import threading
import time
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes_health import router as health_router
from app.api.routes_history import router as history_router
from app.api.routes_jobs import router as jobs_router
from app.api.routes_fs import router as fs_router
from app.api.routes_providers import router as providers_router
from app.core.config import settings
from app.core.logging import setup_logging
from app.providers.local_rembg import model_for_quality_preset, prewarm_rembg_model
from app.storage.provider_settings import provider_settings_store

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
app.include_router(history_router)
app.include_router(fs_router)

if settings.output_dir.exists():
    app.mount("/static/outputs", StaticFiles(directory=str(settings.output_dir.resolve())), name="outputs")


@app.on_event("startup")
def warmup_models() -> None:
    def _warm() -> None:
        started = time.perf_counter()
        try:
            default_preset = provider_settings_store.load().default_quality_preset
            warmup_preset = "fast"
            model_name = model_for_quality_preset(warmup_preset)
            prewarm_rembg_model(model_name)
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            logger.info(
                "Rembg model warmed up (%s, preset=%s, default_preset=%s) in %sms.",
                model_name,
                warmup_preset,
                default_preset,
                elapsed_ms,
            )
        except Exception as exc:
            logger.warning("Rembg warmup failed: %s", exc)

    threading.Thread(target=_warm, daemon=True).start()


@app.get("/")
def root() -> dict:
    return {"name": settings.app_name, "docs": "/docs"}
