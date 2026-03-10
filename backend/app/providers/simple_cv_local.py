import io

from PIL import Image
from scipy import ndimage

from app.providers.base import BackgroundRemovalProvider, ProviderResult


class SimpleCvLocalProvider(BackgroundRemovalProvider):
    name = "simple_cv_local"
    is_local = True

    def health(self) -> tuple[bool, str | None]:
        try:
            _ = ndimage.binary_fill_holes
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
        image = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
        rgba = np.array(image)
        alpha = rgba[:, :, 3]

        if np.count_nonzero(alpha < 250) > 0:
            buffer = io.BytesIO()
            image.save(buffer, format="PNG")
            return ProviderResult(
                content=buffer.getvalue(),
                engine_used="simple_local:existing_alpha",
                provider_used=self.name,
                confidence=0.95,
            )

        raise RuntimeError("simple_cv_local is disabled for non-alpha images")
