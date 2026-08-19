from pathlib import Path
import logging
import shutil

from app.core.config import settings
from app.schemas.models import ModelCatalogItem, ModelStatusResponse
from app.storage.model_state_store import model_state_store


logger = logging.getLogger(__name__)


# included_by_default marks the models that ship inside the installer. Only
# U2NetP does: it is 4 MB, so the app still works offline the moment it is
# installed. Everything else downloads the first time it is actually selected,
# which is what keeps a 928 MB file out of everyone's download.
#
# size_mb is shown in Models before the user commits to a download. Measure it
# against the real .onnx rather than guessing.
REMBG_MODEL_CATALOG: list[dict] = [
    {
        "id": "u2net",
        "task": "cutout",
        "engine": "rembg",
        "name": "U2Net",
        "description": "Original larger U2Net model for general-purpose foreground extraction.",
        "size_mb": 176.0,
        "filename": "u2net.onnx",
        "installable": True,
        "included_by_default": False,
        "runtime_ready": True,
        "status_note": "Large general model. Slower startup than U2NetP and BiRefNet Lite.",
        "download_url": None,
        "checksum": None,
    },
    {
        "id": "u2netp",
        "task": "cutout",
        "engine": "rembg",
        "name": "U2NetP",
        "description": "Lightweight rembg model with fast startup and lower memory use.",
        "size_mb": 4.4,
        "filename": "u2netp.onnx",
        "installable": True,
        "included_by_default": True,
        "runtime_ready": True,
        "download_url": None,
        "checksum": None,
    },
    {
        "id": "u2net_human_seg",
        "task": "cutout",
        "engine": "rembg",
        "name": "U2Net Human Seg",
        "description": "Portrait and person-focused cutout model tuned for human subjects.",
        "size_mb": 176.0,
        "filename": "u2net_human_seg.onnx",
        "installable": True,
        "included_by_default": False,
        "runtime_ready": True,
        "status_note": "Use when the subject is primarily a single person.",
        "download_url": None,
        "checksum": None,
    },
    {
        "id": "birefnet-general-lite",
        "task": "cutout",
        "engine": "rembg",
        "name": "BiRefNet General Lite",
        "description": "Balanced cutout model for general product and photo workflows.",
        "size_mb": 214.0,
        "filename": "birefnet-general-lite.onnx",
        "installable": True,
        "included_by_default": False,
        "runtime_ready": True,
        "status_note": "Downloads on first use, or install it here ahead of time.",
        "download_url": None,
        "checksum": None,
    },
    {
        "id": "birefnet-general",
        "task": "cutout",
        "engine": "rembg",
        "name": "BiRefNet General",
        "description": "Higher-quality edge detail for difficult cutouts with more memory use.",
        "size_mb": 928.0,
        "filename": "birefnet-general.onnx",
        "installable": True,
        "included_by_default": False,
        "runtime_ready": True,
        "status_note": "Nearly a gigabyte. Downloads on first use, or install it here ahead of time.",
        "download_url": None,
        "checksum": None,
    },
    {
        "id": "birefnet-portrait",
        "task": "cutout",
        "engine": "rembg",
        "name": "BiRefNet Portrait",
        "description": "BiRefNet variant tuned for portraits and people.",
        "size_mb": 135.0,
        "filename": "birefnet-portrait.onnx",
        "installable": True,
        "included_by_default": False,
        "runtime_ready": True,
        "status_note": "Best tested on headshots and people-centric photography.",
        "download_url": None,
        "checksum": None,
    },
    {
        "id": "isnet-general-use",
        "task": "cutout",
        "engine": "rembg",
        "name": "ISNet General Use",
        "description": "Alternative general cutout model for comparison against U2Net and BiRefNet.",
        "size_mb": 180.0,
        "filename": "isnet-general-use.onnx",
        "installable": True,
        "included_by_default": False,
        "runtime_ready": True,
        "status_note": "Experimental compare-against-general model.",
        "download_url": None,
        "checksum": None,
    },
    {
        "id": "isnet-anime",
        "task": "cutout",
        "engine": "rembg",
        "name": "ISNet Anime",
        "description": "Anime and illustration-focused cutout model.",
        "size_mb": 180.0,
        "filename": "isnet-anime.onnx",
        "installable": True,
        "included_by_default": False,
        "runtime_ready": True,
        "status_note": "Best suited for illustrations and anime-style assets.",
        "download_url": None,
        "checksum": None,
    },
    {
        "id": "silueta",
        "task": "cutout",
        "engine": "rembg",
        "name": "Silueta",
        "description": "Smaller segmentation model useful for quick silhouette-like extractions.",
        "size_mb": 43.0,
        "filename": "silueta.onnx",
        "installable": True,
        "included_by_default": False,
        "runtime_ready": True,
        "status_note": "Fast experimental option for simpler subjects.",
        "download_url": None,
        "checksum": None,
    },
    {
        "id": "realesrgan-x2plus",
        "task": "enhance",
        "engine": "realesrgan",
        "name": "Real-ESRGAN x2+",
        "description": "Reserved slot for a future local enhancement runtime focused on light upscale and cleanup.",
        "size_mb": 67.0,
        "filename": None,
        "installable": False,
        "included_by_default": False,
        "runtime_ready": False,
        "status_note": "Enhancement runtime is not wired yet.",
        "download_url": None,
        "checksum": None,
    },
    {
        "id": "realesrgan-x4plus",
        "task": "enhance",
        "engine": "realesrgan",
        "name": "Real-ESRGAN x4+",
        "description": "Reserved slot for heavier enhancement and upscale workloads.",
        "size_mb": 130.0,
        "filename": None,
        "installable": False,
        "included_by_default": False,
        "runtime_ready": False,
        "status_note": "Enhancement runtime is not wired yet.",
        "download_url": None,
        "checksum": None,
    },
    {
        "id": "wd-swinv2-tagger",
        "task": "tagging",
        "engine": "wdtagger",
        "name": "WD Tagger",
        "description": "Future local tagging/classification model for automatic metadata and routing.",
        "size_mb": 190.0,
        "filename": None,
        "installable": False,
        "included_by_default": False,
        "runtime_ready": False,
        "status_note": "Tagging models are planned but not active.",
        "download_url": None,
        "checksum": None,
    },
    {
        "id": "tesseract-ocr-eng",
        "task": "ocr",
        "engine": "tesseract",
        "name": "Tesseract OCR (English)",
        "description": "Future optional OCR package for naming and text-aware automation.",
        "size_mb": 45.0,
        "filename": None,
        "installable": False,
        "included_by_default": False,
        "runtime_ready": False,
        "status_note": "OCR assets will be optional when naming OCR is promoted to a real runtime.",
        "download_url": None,
        "checksum": None,
    },
]


class ModelCatalogService:
    def __init__(self) -> None:
        self.catalog = {item["id"]: item for item in REMBG_MODEL_CATALOG}
        self.bootstrap_bundled_defaults()

    def models_dir(self) -> Path:
        path = Path(settings.rembg_models_dir).expanduser().resolve()
        path.mkdir(parents=True, exist_ok=True)
        return path

    def bundled_models_dir(self) -> Path | None:
        if not settings.bundled_rembg_models_dir:
            return None
        path = Path(settings.bundled_rembg_models_dir).expanduser().resolve()
        return path if path.exists() else None

    def bootstrap_bundled_defaults(self) -> None:
        bundled_dir = self.bundled_models_dir()
        if bundled_dir is None:
            return
        target_dir = self.models_dir()
        for meta in self.catalog.values():
            if not meta.get("installable", True):
                continue
            source = bundled_dir / str(meta["filename"])
            target = target_dir / str(meta["filename"])
            if not source.exists():
                continue
            try:
                if not target.exists():
                    shutil.copy2(source, target)
                checksum = model_state_store.sha256_for(target)
                model_state_store.upsert(
                    str(meta["id"]),
                    install_state="installed",
                    local_path=str(target),
                    last_error=None,
                    checksum=checksum,
                )
            except OSError as exc:
                logger.warning("Failed to bootstrap bundled model %s: %s", meta["id"], exc)
                model_state_store.upsert(
                    str(meta["id"]),
                    install_state="failed",
                    local_path=str(target) if target.exists() else None,
                    last_error=str(exc),
                    checksum=None,
                )

    def refresh_state(self, task: str | None = None) -> list[ModelCatalogItem]:
        states = model_state_store.list()
        for meta in self.catalog.values():
            if task and meta["task"] != task:
                continue
            model_id = str(meta["id"])
            current = states.get(model_id, {})
            if not meta.get("installable", True) or not meta.get("filename"):
                continue
            local_path = self.local_path_for(model_id)
            if local_path.exists():
                model_state_store.upsert(
                    model_id,
                    install_state="installed",
                    local_path=str(local_path),
                    last_error=None,
                    last_used_at=current.get("last_used_at"),
                    checksum=current.get("checksum"),
                )
            else:
                model_state_store.upsert(
                    model_id,
                    install_state="not_installed",
                    local_path=None,
                    last_error=None,
                    last_used_at=current.get("last_used_at"),
                    checksum=current.get("checksum"),
                )
        return self.list_catalog(task=task)

    def local_path_for(self, model_id: str) -> Path:
        meta = self.catalog.get(model_id)
        if not meta:
            raise KeyError(f"Unknown model: {model_id}")
        if not meta.get("installable", True) or not meta.get("filename"):
            raise RuntimeError(f"Model '{model_id}' is not installable in this build")
        return self.models_dir() / str(meta["filename"])

    def exists(self, model_id: str) -> bool:
        return self.local_path_for(model_id).exists()

    def get_meta(self, model_id: str) -> dict:
        meta = self.catalog.get(model_id)
        if not meta:
            raise KeyError(f"Unknown model: {model_id}")
        return meta

    def list_catalog(self, task: str | None = None) -> list[ModelCatalogItem]:
        states = model_state_store.list()
        items: list[ModelCatalogItem] = []
        for meta in self.catalog.values():
            if task and meta["task"] != task:
                continue
            state = states.get(str(meta["id"]), {})
            local_path_value: str | None = None
            installed = False
            if meta.get("installable", True) and meta.get("filename"):
                local_path_value = str(self.local_path_for(str(meta["id"])))
                installed = Path(local_path_value).exists()
            install_state = "installed" if installed else state.get("install_state", "not_installed")
            if install_state == "installed" and not installed:
                install_state = "not_installed"
            items.append(
                ModelCatalogItem(
                    id=str(meta["id"]),
                    task=meta["task"],
                    engine=meta["engine"],
                    name=str(meta["name"]),
                    description=str(meta["description"]),
                    size_mb=float(meta["size_mb"]),
                    filename=str(meta["filename"]) if meta.get("filename") else None,
                    installable=bool(meta.get("installable", True)),
                    included_by_default=bool(meta.get("included_by_default", False)),
                    runtime_ready=bool(meta.get("runtime_ready", False)),
                    status_note=meta.get("status_note"),
                    download_url=meta.get("download_url"),
                    checksum=state.get("checksum") or meta.get("checksum"),
                    installed=installed,
                    install_state=install_state,
                    local_path=local_path_value if installed else None,
                    last_error=state.get("last_error"),
                    last_used_at=state.get("last_used_at"),
                )
            )
        return items

    def status_for(self, model_id: str) -> ModelStatusResponse:
        meta = self.get_meta(model_id)
        state = model_state_store.get(model_id) or {}
        local_path_value: str | None = None
        installed = False
        if meta.get("installable", True) and meta.get("filename"):
            local_path = self.local_path_for(model_id)
            local_path_value = str(local_path)
            installed = local_path.exists()
        install_state = "installed" if installed else state.get("install_state", "not_installed")
        if install_state == "installed" and not installed:
            install_state = "not_installed"
        return ModelStatusResponse(
            id=str(meta["id"]),
            installed=installed,
            install_state=install_state,
            local_path=local_path_value if installed else None,
            last_error=state.get("last_error"),
            last_used_at=state.get("last_used_at"),
        )


model_catalog_service = ModelCatalogService()
