import json
import os
from pathlib import Path
from app.core.config import settings
from app.schemas.providers import ProviderSettingsPayload

try:
    from cryptography.fernet import Fernet, InvalidToken
except Exception:
    Fernet = None  # type: ignore[assignment]
    InvalidToken = Exception  # type: ignore[assignment]


class ProviderSettingsStore:
    def __init__(self) -> None:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        self.path = settings.data_dir / "providers.json"
        self.encrypted_path = settings.data_dir / "providers.secure.json"
        self.key_path = settings.data_dir / ".providers.key"
        self.use_encryption = bool(Fernet) and (settings.running_in_tauri or settings.provider_settings_encrypt)

    def _ensure_key(self) -> bytes:
        if not Fernet:
            raise RuntimeError("cryptography is not available")
        if settings.provider_settings_key:
            return settings.provider_settings_key.encode("utf-8")

        if self.key_path.exists():
            return self.key_path.read_bytes().strip()

        key = Fernet.generate_key()
        self.key_path.write_bytes(key)
        try:
            os.chmod(self.key_path, 0o600)
        except OSError:
            pass
        return key

    def _decrypt_payload(self, raw: bytes) -> ProviderSettingsPayload:
        if not Fernet:
            raise RuntimeError("cryptography is not available")
        cipher = Fernet(self._ensure_key())
        try:
            decrypted = cipher.decrypt(raw)
        except InvalidToken as exc:
            raise RuntimeError("Provider settings could not be decrypted.") from exc
        return ProviderSettingsPayload.model_validate_json(decrypted)

    def _encrypt_payload(self, payload: ProviderSettingsPayload) -> bytes:
        if not Fernet:
            raise RuntimeError("cryptography is not available")
        cipher = Fernet(self._ensure_key())
        return cipher.encrypt(payload.model_dump_json(indent=2).encode("utf-8"))

    def load(self) -> ProviderSettingsPayload:
        if self.use_encryption:
            if self.encrypted_path.exists():
                return self._decrypt_payload(self.encrypted_path.read_bytes())
            if self.path.exists():
                payload = ProviderSettingsPayload.model_validate(
                    json.loads(self.path.read_text(encoding="utf-8"))
                )
                self.save(payload)
                try:
                    self.path.unlink()
                except OSError:
                    pass
                return payload
            return ProviderSettingsPayload()

        if not self.path.exists():
            return ProviderSettingsPayload()
        data = json.loads(self.path.read_text(encoding="utf-8"))
        return ProviderSettingsPayload.model_validate(data)

    def save(self, payload: ProviderSettingsPayload) -> None:
        if self.use_encryption:
            self.encrypted_path.write_bytes(self._encrypt_payload(payload))
            if self.path.exists():
                try:
                    self.path.unlink()
                except OSError:
                    pass
            return
        self.path.write_text(payload.model_dump_json(indent=2), encoding="utf-8")


provider_settings_store = ProviderSettingsStore()
