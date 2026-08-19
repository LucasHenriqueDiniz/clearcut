import gc
import io
import os
import threading
from collections import OrderedDict
from pathlib import Path
from PIL import Image
from rembg import new_session, remove
from app.providers.base import BackgroundRemovalProvider, ProviderResult
from app.core.config import settings
from app.services.model_catalog import model_catalog_service
from app.storage.model_state_store import model_state_store

PRESET_CONFIG = {
    "fast": {
        "model_name": "u2netp",
        "alpha_matting": False,
        "post_process_mask": False,
    },
    "balanced": {
        "model_name": "birefnet-general-lite",
        "alpha_matting": False,
        "post_process_mask": True,
    },
    "hq": {
        "model_name": "birefnet-general",
        "alpha_matting": True,
        "alpha_matting_foreground_threshold": 240,
        "alpha_matting_background_threshold": 8,
        "alpha_matting_erode_size": 8,
        "post_process_mask": True,
    },
}

MEMORY_ERROR_MARKERS = (
    "failed to allocate memory",
    "unable to allocate",
    "out of memory",
    "bfcarena",
    "std::bad_alloc",
)

# Two entries cover the common shapes: one model in use, plus the fallback
# (u2netp) or a second job running a different preset. Sessions are ~50-900MB
# resident, so this is deliberately small.
_MAX_CACHED_SESSIONS = 2


class _SessionPool:
    """Keeps one rembg session per model, shared by all worker threads.

    Building a session costs seconds, and a single global slot meant two jobs
    on different models evicted each other on *every* image. The slot was also
    read and rewritten without a lock while several jobs ran concurrently.

    Sharing one session across threads is safe: ONNX Runtime's `Run` is
    thread-safe and rembg's `predict` keeps no per-call state on the session.
    """

    def __init__(self, max_entries: int = _MAX_CACHED_SESSIONS) -> None:
        self._sessions: OrderedDict[str, object] = OrderedDict()
        self._build_locks: dict[str, threading.Lock] = {}
        self._lock = threading.Lock()
        self._max_entries = max_entries

    def _peek(self, model_name: str) -> object | None:
        with self._lock:
            session = self._sessions.get(model_name)
            if session is not None:
                self._sessions.move_to_end(model_name)
            return session

    def get(self, model_name: str, factory) -> object:
        session = self._peek(model_name)
        if session is not None:
            return session

        with self._lock:
            build_lock = self._build_locks.setdefault(model_name, threading.Lock())

        # One builder per model, and never under `self._lock`: `new_session`
        # takes seconds, so holding the shared lock would stall workers that
        # are already warm, and letting every thread build would construct a
        # full session per worker just to throw all but one away.
        with build_lock:
            session = self._peek(model_name)
            if session is not None:
                return session
            session = factory(model_name)
            with self._lock:
                self._sessions[model_name] = session
                while len(self._sessions) > self._max_entries:
                    self._sessions.popitem(last=False)
            return session

    def clear(self) -> None:
        with self._lock:
            self._sessions.clear()
        gc.collect()


_session_pool = _SessionPool()

def model_for_quality_preset(quality_preset: str | None) -> str:
    preset_key = quality_preset if quality_preset in PRESET_CONFIG else "balanced"
    return str(PRESET_CONFIG[preset_key]["model_name"])


def resolve_runtime_config(
    *,
    model: str | None = None,
    quality_preset: str | None = None,
) -> tuple[str, str, dict]:
    preset_key = quality_preset if quality_preset in PRESET_CONFIG else "balanced"
    config = dict(PRESET_CONFIG[preset_key])
    model_name = model or model_for_quality_preset(preset_key)
    config.pop("model_name", None)
    return preset_key, model_name, config


def _models_dir() -> Path:
    return Path(settings.rembg_models_dir).expanduser().resolve()


def _ensure_model_exists(model_name: str) -> None:
    try:
        target = model_catalog_service.local_path_for(model_name)
    except KeyError:
        raise RuntimeError(
            f"Unsupported rembg model '{model_name}'. "
            f"Allowed local models: {', '.join(sorted(model_catalog_service.catalog.keys()))}"
        )
    if not target.exists():
        raise RuntimeError(
            f"Local rembg model not installed: {model_name}. "
            "Install it from Models."
        )


def get_rembg_session(model_name: str):
    _ensure_model_exists(model_name)
    os.environ["U2NET_HOME"] = str(_models_dir())
    return _session_pool.get(model_name, new_session)


def prewarm_rembg_model(model_name: str = "u2netp") -> None:
    session = get_rembg_session(model_name)
    image = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    remove(buffer.getvalue(), session=session, force_return_bytes=True)


def clear_rembg_session_cache() -> None:
    """Drop every cached session, e.g. after a model is installed or moved."""
    _session_pool.clear()


def _is_memory_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return any(marker in message for marker in MEMORY_ERROR_MARKERS)


def _safe_max_dim_for(model_name: str) -> int:
    if model_name.startswith("birefnet"):
        return 640
    if model_name.startswith("isnet"):
        return 640
    if model_name.startswith("silueta"):
        return 768
    if model_name.startswith("u2net"):
        return 960
    return 768


def _resize_for_low_memory(image_bytes: bytes, model_name: str, *, config: dict) -> bytes:
    original = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    original.load()
    source_max_dim = max(original.size)
    safe_config = dict(config)
    safe_config["alpha_matting"] = False
    safe_config["post_process_mask"] = False

    for target_max_dim in (_safe_max_dim_for(model_name), 512, 384):
        if source_max_dim <= target_max_dim:
            resize_ratio = min(0.75, target_max_dim / float(max(1, source_max_dim)))
        else:
            resize_ratio = target_max_dim / float(source_max_dim)
        target_size = (
            max(1, int(round(original.width * resize_ratio))),
            max(1, int(round(original.height * resize_ratio))),
        )

        clear_rembg_session_cache()
        reduced = original.resize(target_size, Image.Resampling.LANCZOS)
        reduced_buffer = io.BytesIO()
        reduced.save(reduced_buffer, format="PNG")
        reduced_output = remove(
            reduced_buffer.getvalue(),
            session=get_rembg_session(model_name),
            force_return_bytes=True,
            **safe_config,
        )

        reduced_image = Image.open(io.BytesIO(reduced_output)).convert("RGBA")
        reduced_image.load()
        resized_alpha = reduced_image.getchannel("A").resize(original.size, Image.Resampling.LANCZOS)
        original.putalpha(resized_alpha)

        output_buffer = io.BytesIO()
        original.save(output_buffer, format="PNG")
        return output_buffer.getvalue()

    raise RuntimeError(f"Low-memory retry failed for model: {model_name}")


def _estimate_confidence(output: bytes) -> float:
    """Score how plausible a cutout is, from its alpha channel.

    An empty alpha means the model removed everything; a fully opaque one
    usually means it found no subject at all.
    """
    try:
        image = Image.open(io.BytesIO(output)).convert("RGBA")
        alpha = image.getchannel("A")
        if not alpha.getbbox():
            return 0.1
        # histogram() is a single C-level pass over the band. Counting in
        # Python costs one iteration per pixel and dominates runtime on
        # large images.
        histogram = alpha.histogram()
        non_transparent = sum(histogram[6:])
        total = image.width * image.height
        fill_ratio = non_transparent / max(1, total)
        return 0.35 if fill_ratio > 0.98 else 0.8
    except Exception:
        return 0.6


class RembgLocalProvider(BackgroundRemovalProvider):
    name = "rembg_local"
    is_local = True

    def health(self) -> tuple[bool, str | None]:
        try:
            installed = [item.id for item in model_catalog_service.list_catalog(task="cutout") if item.installed]
            if not installed:
                return False, "No local rembg models installed"
            return True, None
        except Exception as exc:  # pragma: no cover
            return False, str(exc)

    def remove_background(
        self,
        image_bytes: bytes,
        *,
        model: str | None = None,
        quality_preset: str | None = None,
        api_key: str | None = None,
    ) -> ProviderResult:
        preset_key, model_name, config = resolve_runtime_config(
            model=model,
            quality_preset=quality_preset,
        )
        try:
            output = remove(
                image_bytes,
                session=get_rembg_session(model_name),
                force_return_bytes=True,
                **config,
            )
        except Exception as exc:
            if _is_memory_error(exc):
                try:
                    clear_rembg_session_cache()
                    gc.collect()
                    output = _resize_for_low_memory(image_bytes, model_name, config=config)
                except Exception as retry_exc:
                    if model:
                        raise RuntimeError(
                            f"{exc} | low-memory retry failed for {model_name}: {retry_exc}"
                        ) from exc
                else:
                    image = Image.open(io.BytesIO(output)).convert("RGBA")
                    image.load()
                    model_state_store.mark_used(model_name)
                    return ProviderResult(
                        content=output,
                        engine_used=f"rembg:{model_name}:{preset_key}",
                        provider_used=self.name,
                        confidence=0.72,
                    )
            if model:
                raise exc
            fallback_model = "u2netp"
            output = remove(
                image_bytes,
                session=get_rembg_session(fallback_model),
                force_return_bytes=True,
                alpha_matting=False,
                post_process_mask=False,
            )
            model_name = fallback_model
            preset_key = "fast"
        confidence = _estimate_confidence(output)
        model_state_store.mark_used(model_name)
        return ProviderResult(
            content=output,
            engine_used=f"rembg:{model_name}:{preset_key}",
            provider_used=self.name,
            confidence=confidence,
        )
