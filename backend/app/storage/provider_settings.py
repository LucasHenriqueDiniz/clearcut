import json
import os
import tempfile
import threading
import time
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
        self._cache: ProviderSettingsPayload | None = None
        self._cache_fingerprint: tuple | None = None
        self._cache_lock = threading.Lock()

    def _active_path(self) -> Path:
        return self.encrypted_path if self.use_encryption else self.path

    def _fingerprint(self) -> tuple | None:
        """Cheap identity of the settings file, used to detect edits on disk."""
        try:
            stat = self._active_path().stat()
        except OSError:
            return None
        return (stat.st_mtime_ns, stat.st_size)

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
        """Return the settings, reading from disk only when the file changed.

        This runs once per processed image, so re-reading (and decrypting)
        the file every time showed up as per-image I/O in batches.
        """
        fingerprint = self._fingerprint()
        with self._cache_lock:
            if self._cache is not None and self._cache_fingerprint == fingerprint:
                return self._cache
        payload = self._load_from_disk()
        with self._cache_lock:
            self._cache = payload
            self._cache_fingerprint = self._fingerprint()
        return payload

    @staticmethod
    def _read_with_retry(path: Path) -> bytes:
        """Read a file, tolerating the brief window where a rename holds it.

        On Windows an open() can fail with PermissionError while another
        thread swaps the file into place; the content itself is never partial.
        """
        last_error: OSError | None = None
        for attempt in range(20):
            try:
                return path.read_bytes()
            except PermissionError as exc:
                last_error = exc
                time.sleep(0.02 * (attempt + 1))
        raise last_error if last_error else OSError("read failed")

    def _load_from_disk(self) -> ProviderSettingsPayload:
        if self.use_encryption:
            if self.encrypted_path.exists():
                return self._decrypt_payload(self._read_with_retry(self.encrypted_path))
            if self.path.exists():
                payload = ProviderSettingsPayload.model_validate(
                    json.loads(self._read_with_retry(self.path).decode("utf-8"))
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
        data = json.loads(self._read_with_retry(self.path).decode("utf-8"))
        return ProviderSettingsPayload.model_validate(data)

    def save(self, payload: ProviderSettingsPayload) -> None:
        self._save_to_disk(payload)
        with self._cache_lock:
            self._cache = payload
            self._cache_fingerprint = self._fingerprint()

    @staticmethod
    def _atomic_write(target: Path, data: bytes) -> None:
        """Write via a temp file + rename.

        Concurrent jobs can both persist settings; a partial write here would
        destroy the user's API keys.
        """
        target.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(dir=str(target.parent), prefix=f".{target.name}.", suffix=".tmp")
        tmp_path = Path(tmp_name)
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(data)
                handle.flush()
                os.fsync(handle.fileno())
            # On Windows os.replace fails while any handle to the target is
            # open, so a concurrent reader can make this raise; retry briefly.
            last_error: OSError | None = None
            for attempt in range(20):
                try:
                    os.replace(tmp_path, target)
                    return
                except PermissionError as exc:
                    last_error = exc
                    time.sleep(0.02 * (attempt + 1))
            raise last_error if last_error else OSError("replace failed")
        except BaseException:
            tmp_path.unlink(missing_ok=True)
            raise

    def _save_to_disk(self, payload: ProviderSettingsPayload) -> None:
        if self.use_encryption:
            self._atomic_write(self.encrypted_path, self._encrypt_payload(payload))
            if self.path.exists():
                try:
                    self.path.unlink()
                except OSError:
                    pass
            return
        self._atomic_write(self.path, payload.model_dump_json(indent=2).encode("utf-8"))


provider_settings_store = ProviderSettingsStore()
