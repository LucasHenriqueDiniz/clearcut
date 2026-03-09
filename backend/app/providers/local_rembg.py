import io
from functools import lru_cache
from PIL import Image
from rembg import new_session, remove
from app.providers.base import BackgroundRemovalProvider, ProviderResult


@lru_cache(maxsize=8)
def get_rembg_session(model_name: str):
    return new_session(model_name)


class RembgLocalProvider(BackgroundRemovalProvider):
    name = "rembg_local"
    is_local = True

    def health(self) -> tuple[bool, str | None]:
        try:
            return True, None
        except Exception as exc:  # pragma: no cover
            return False, str(exc)

    def remove_background(self, image_bytes: bytes, *, model: str | None = None, api_key: str | None = None) -> ProviderResult:
        model_name = model or "u2net"
        output = remove(image_bytes, session=get_rembg_session(model_name), force_return_bytes=True)
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
        return ProviderResult(content=output, engine_used=f"rembg:{model_name}", provider_used=self.name, confidence=confidence)
