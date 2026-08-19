import os
import threading

from app.providers.local_rembg import clear_rembg_session_cache
from app.services.model_catalog import model_catalog_service
from app.storage.model_state_store import model_state_store


class ModelInstallerService:
    def __init__(self) -> None:
        self._installing: set[str] = set()
        self._download_gates: dict[str, threading.Lock] = {}
        self._lock = threading.Lock()

    def has_active_installs(self) -> bool:
        with self._lock:
            return bool(self._installing)

    def install(self, model_id: str) -> dict:
        meta = model_catalog_service.get_meta(model_id)
        if not meta.get("installable", True):
            raise RuntimeError(f"Model '{model_id}' is not installable in this build")
        status = model_catalog_service.status_for(model_id)
        if status.installed:
            return status.model_dump()

        with self._lock:
            if model_id in self._installing:
                return model_catalog_service.status_for(model_id).model_dump()
            self._installing.add(model_id)

        model_state_store.upsert(model_id, install_state="downloading", local_path=None, last_error=None)
        worker = threading.Thread(target=self._install_worker, args=(model_id,), daemon=True)
        worker.start()
        return model_catalog_service.status_for(model_id).model_dump()

    def ensure_installed(self, model_id: str) -> None:
        """Fetch a model if it is missing, blocking until it is on disk.

        Only the small default model ships in the installer; the rest arrive
        the first time something actually asks for them. Jobs process files in
        parallel, so several workers can want the same missing model at once --
        a per-model gate makes the first one download while the others wait,
        instead of each starting its own download into the same path.
        """
        target_path = model_catalog_service.local_path_for(model_id)
        if target_path.exists():
            return

        with self._lock:
            gate = self._download_gates.setdefault(model_id, threading.Lock())

        with gate:
            if target_path.exists():
                return
            model_state_store.upsert(
                model_id, install_state="downloading", local_path=None, last_error=None
            )
            self._download(model_id)

        status = model_catalog_service.status_for(model_id)
        if not status.installed:
            raise RuntimeError(
                f"Could not download model '{model_id}': {status.last_error or 'unknown error'}"
            )

    def _download(self, model_id: str) -> None:
        target_dir = model_catalog_service.models_dir()
        target_path = model_catalog_service.local_path_for(model_id)
        os.environ["U2NET_HOME"] = str(target_dir)
        try:
            from rembg import new_session

            new_session(model_name=model_id)
            if not target_path.exists():
                raise RuntimeError(f"Model download did not create expected file: {target_path}")
            checksum = model_state_store.sha256_for(target_path)
            model_state_store.upsert(
                model_id,
                install_state="installed",
                local_path=str(target_path),
                last_error=None,
                checksum=checksum,
            )
        except Exception as exc:
            model_state_store.upsert(
                model_id,
                install_state="failed",
                local_path=str(target_path) if target_path.exists() else None,
                last_error=str(exc),
            )

    def _install_worker(self, model_id: str) -> None:
        try:
            self._download(model_id)
        finally:
            with self._lock:
                self._installing.discard(model_id)

    def delete(self, model_id: str) -> bool:
        meta = model_catalog_service.get_meta(model_id)
        if not meta.get("installable", True):
            return False
        target_path = model_catalog_service.local_path_for(model_id)
        removed = False
        if target_path.exists():
            target_path.unlink(missing_ok=True)
            removed = True
        removed = model_state_store.delete(model_id) or removed
        clear_rembg_session_cache()
        return removed


model_installer_service = ModelInstallerService()
