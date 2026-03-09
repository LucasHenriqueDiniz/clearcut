from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional
from app.providers.base import BackgroundRemovalProvider, ProviderResult
from app.providers.local_rembg import RembgLocalProvider
from app.providers.remove_bg_api import RemoveBgApiProvider
from app.providers.simple_cv_local import SimpleCvLocalProvider
from app.schemas.providers import ProviderSettingsPayload, ProviderStatus
from app.storage.provider_settings import provider_settings_store


@dataclass
class ProviderExecution:
    result: ProviderResult
    via_api: bool


class ProviderRegistry:
    def __init__(self) -> None:
        self.providers: dict[str, BackgroundRemovalProvider] = {
            "simple_cv_local": SimpleCvLocalProvider(),
            "rembg_local": RembgLocalProvider(),
            "remove_bg_api": RemoveBgApiProvider(),
        }
        self.settings = provider_settings_store.load()
        self._ensure_defaults()

    def _ensure_defaults(self) -> None:
        known = {p.name for p in self.settings.providers}
        defaults = {"simple_cv_local": 1, "rembg_local": 5, "remove_bg_api": 20}
        changed = False
        for name, prio in defaults.items():
            if name not in known:
                self.settings.providers.append(
                    {
                        "name": name,
                        "enabled": True,
                        "priority": prio,
                        "keys": [],
                    }
                )
                changed = True
        if changed:
            # pydantic validation roundtrip
            self.settings = ProviderSettingsPayload.model_validate(self.settings.model_dump())
            provider_settings_store.save(self.settings)

    def reload(self) -> ProviderSettingsPayload:
        self.settings = provider_settings_store.load()
        self._ensure_defaults()
        return self.settings

    def save(self, payload: ProviderSettingsPayload) -> ProviderSettingsPayload:
        self.settings = payload
        self._ensure_defaults()
        provider_settings_store.save(self.settings)
        return self.settings

    def get_provider_status(self) -> list[ProviderStatus]:
        self.reload()
        statuses: list[ProviderStatus] = []
        settings_by_name = {p.name: p for p in self.settings.providers}
        for name, provider in self.providers.items():
            st = settings_by_name.get(name)
            enabled = bool(st.enabled) if st else True
            healthy, err = provider.health()
            statuses.append(
                ProviderStatus(
                    name=name,
                    enabled=enabled,
                    available=name in self.providers,
                    is_local=provider.is_local,
                    priority=st.priority if st else 100,
                    key_count=len(st.keys) if st else 0,
                    healthy=healthy,
                    last_error=err,
                )
            )
        return sorted(statuses, key=lambda item: item.priority)

    def test_provider(self, name: str) -> dict:
        self.reload()
        provider = self.providers.get(name)
        if not provider:
            return {"ok": False, "message": "Unknown provider"}
        healthy, err = provider.health()
        if not healthy:
            return {"ok": False, "message": err or "Provider health check failed"}
        setting = next((p for p in self.settings.providers if p.name == name), None)
        if setting and not provider.is_local:
            active_keys = [k for k in setting.keys if k.enabled and k.key]
            if not active_keys:
                return {"ok": False, "message": "No enabled API keys configured"}
        return {"ok": True, "message": "Provider is configured and healthy"}

    def _ordered_provider_settings(self, preferred: list[str]) -> list:
        by_name = {p.name: p for p in self.settings.providers}
        ordered = [by_name[name] for name in preferred if name in by_name and by_name[name].enabled]
        remaining = [p for p in self.settings.providers if p.enabled and p.name not in preferred]
        remaining.sort(key=lambda p: p.priority)
        return ordered + remaining

    def _pick_key(self, setting) -> Optional[tuple[int, object]]:
        now = datetime.now(timezone.utc)
        eligible: list[tuple[int, object]] = []
        for idx, key in enumerate(setting.keys):
            if not key.enabled:
                continue
            if key.cooldown_until and key.cooldown_until.replace(tzinfo=timezone.utc) > now:
                continue
            eligible.append((idx, key))
        eligible.sort(key=lambda item: item[1].priority)
        return eligible[0] if eligible else None

    def _mark_success(self, setting, idx: int) -> None:
        key = setting.keys[idx]
        key.used_count += 1
        key.last_success_at = datetime.utcnow()
        key.last_error = None
        key.cooldown_until = None

    def _mark_failure(self, setting, idx: int, error: str) -> None:
        key = setting.keys[idx]
        key.last_error = error
        key.cooldown_until = datetime.utcnow() + timedelta(seconds=90)

    def remove_background(self, image_bytes: bytes, *, model: str, provider_priority: list[str], allow_external: bool) -> ProviderExecution:
        self.reload()
        allow_external = allow_external and (not self.settings.use_only_local)
        ordered = self._ordered_provider_settings(provider_priority)
        errors: list[str] = []

        for setting in ordered:
            provider = self.providers.get(setting.name)
            if not provider:
                continue
            if provider.is_local:
                try:
                    result = provider.remove_background(image_bytes, model=model)
                    if allow_external and result.confidence < 0.45:
                        errors.append(f"{provider.name}: low confidence ({result.confidence:.2f}), trying fallback")
                        continue
                    return ProviderExecution(result=result, via_api=False)
                except Exception as exc:
                    errors.append(f"{provider.name}: {exc}")
                    continue

            if not allow_external:
                continue

            picked = self._pick_key(setting)
            while picked:
                idx, key = picked
                try:
                    result = provider.remove_background(image_bytes, model=model, api_key=key.key)
                    self._mark_success(setting, idx)
                    provider_settings_store.save(self.settings)
                    return ProviderExecution(result=result, via_api=True)
                except Exception as exc:
                    error_text = str(exc)
                    self._mark_failure(setting, idx, error_text)
                    errors.append(f"{provider.name}:{key.label} -> {error_text}")
                    picked = self._pick_key(setting)

        provider_settings_store.save(self.settings)
        raise RuntimeError("No provider could process image. " + " | ".join(errors))


provider_registry = ProviderRegistry()
