import io
import os
from functools import lru_cache
from pathlib import Path
from PIL import Image
from rembg import new_session, remove
from app.providers.base import BackgroundRemovalProvider, ProviderResult
from app.core.config import settings

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

MODEL_FILENAME_MAP = {
    "u2netp": "u2netp.onnx",
    "birefnet-general-lite": "birefnet-general-lite.onnx",
    "birefnet-general": "birefnet-general.onnx",
}


def model_for_quality_preset(quality_preset: str | None) -> str:
    preset_key = quality_preset if quality_preset in PRESET_CONFIG else "balanced"
    return str(PRESET_CONFIG[preset_key]["model_name"])


def _models_dir() -> Path:
    return Path(settings.rembg_models_dir).expanduser().resolve()


def _ensure_model_exists(model_name: str) -> None:
    model_file = MODEL_FILENAME_MAP.get(model_name)
    if not model_file:
        raise RuntimeError(
            f"Unsupported rembg model '{model_name}'. "
            f"Allowed bundled models: {', '.join(sorted(MODEL_FILENAME_MAP.keys()))}"
        )
    target = _models_dir() / model_file
    if not target.exists():
        raise RuntimeError(
            f"Bundled rembg model not found: {target}. "
            "Rebuild with scripts/prepare-rembg-models.py."
        )


@lru_cache(maxsize=8)
def get_rembg_session(model_name: str):
    _ensure_model_exists(model_name)
    os.environ["U2NET_HOME"] = str(_models_dir())
    return new_session(model_name)


def prewarm_rembg_model(model_name: str = "u2netp") -> None:
    session = get_rembg_session(model_name)
    image = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    remove(buffer.getvalue(), session=session, force_return_bytes=True)


class RembgLocalProvider(BackgroundRemovalProvider):
    name = "rembg_local"
    is_local = True

    def health(self) -> tuple[bool, str | None]:
        try:
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
        preset_key = quality_preset if quality_preset in PRESET_CONFIG else "balanced"
        config = dict(PRESET_CONFIG[preset_key])
        model_name = model or model_for_quality_preset(preset_key)
        config.pop("model_name", None)
        try:
            output = remove(
                image_bytes,
                session=get_rembg_session(model_name),
                force_return_bytes=True,
                **config,
            )
        except Exception:
            if model:
                raise
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
        confidence = 0.8
        try:
            image = Image.open(io.BytesIO(output)).convert("RGBA")
            alpha = image.getchannel("A")
            bbox = alpha.getbbox()
            if not bbox:
                confidence = 0.1
            else:
                non_transparent = sum(1 for v in alpha.getdata() if v > 5)
                total = image.width * image.height
                fill_ratio = non_transparent / max(1, total)
                confidence = 0.35 if fill_ratio > 0.98 else 0.8
        except Exception:
            confidence = 0.6
        return ProviderResult(
            content=output,
            engine_used=f"rembg:{model_name}:{preset_key}",
            provider_used=self.name,
            confidence=confidence,
        )
