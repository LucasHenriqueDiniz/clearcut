from fastapi import APIRouter
from app.providers.registry import provider_registry
from app.schemas.providers import ProviderSettingsPayload, ProviderStatus

router = APIRouter(prefix="/providers", tags=["providers"])


@router.get("/status", response_model=list[ProviderStatus])
def get_provider_status() -> list[ProviderStatus]:
    return provider_registry.get_provider_status()


@router.get("/settings", response_model=ProviderSettingsPayload)
def get_provider_settings() -> ProviderSettingsPayload:
    return provider_registry.reload()


@router.post("/settings", response_model=ProviderSettingsPayload)
def save_provider_settings(payload: ProviderSettingsPayload) -> ProviderSettingsPayload:
    return provider_registry.save(payload)


@router.post("/test/{provider_name}")
def test_provider(provider_name: str) -> dict:
    return provider_registry.test_provider(provider_name)
