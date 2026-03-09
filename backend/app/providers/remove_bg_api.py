import requests
from app.providers.base import BackgroundRemovalProvider, ProviderResult


class RemoveBgApiProvider(BackgroundRemovalProvider):
    name = "remove_bg_api"
    is_local = False
    endpoint = "https://api.remove.bg/v1.0/removebg"

    def health(self) -> tuple[bool, str | None]:
        # remove.bg has no anonymous ping endpoint. Treat configured key test as runtime check.
        return True, None

    def remove_background(self, image_bytes: bytes, *, model: str | None = None, api_key: str | None = None) -> ProviderResult:
        if not api_key:
            raise RuntimeError("Missing remove.bg API key")
        response = requests.post(
            self.endpoint,
            files={"image_file": ("image.png", image_bytes)},
            data={"size": "auto"},
            headers={"X-Api-Key": api_key},
            timeout=90,
        )
        if response.status_code >= 400:
            raise RuntimeError(f"remove.bg failed ({response.status_code}): {response.text[:300]}")
        return ProviderResult(content=response.content, engine_used="remove.bg", provider_used=self.name, confidence=0.95)
