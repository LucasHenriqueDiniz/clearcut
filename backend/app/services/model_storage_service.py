import shutil
from pathlib import Path

from app.core.config import settings
from app.providers.local_rembg import clear_rembg_session_cache
from app.schemas.models import ModelStorageConfig
from app.services.model_catalog import model_catalog_service
from app.services.model_installer import model_installer_service
from app.storage.app_settings_store import app_settings_store
from app.storage.model_state_store import model_state_store


MODELS_ROOT_KEY = "models_root_dir"


class ModelStorageService:
    def __init__(self) -> None:
        self.default_root = Path(settings.models_dir).expanduser().resolve()

    def get_config(self) -> ModelStorageConfig:
        root_dir = Path(settings.models_dir).expanduser().resolve()
        rembg_dir = Path(settings.rembg_models_dir).expanduser().resolve()
        return ModelStorageConfig(
            root_dir=str(root_dir),
            rembg_dir=str(rembg_dir),
            default_root_dir=str(self.default_root),
            using_custom_root=root_dir != self.default_root,
        )

    def load_persisted_root(self) -> None:
        persisted_root = app_settings_store.get(MODELS_ROOT_KEY)
        if persisted_root:
            try:
                self.set_root(persisted_root, persist=False)
                return
            except OSError:
                app_settings_store.delete(MODELS_ROOT_KEY)
            except RuntimeError:
                pass
        model_catalog_service.bootstrap_bundled_defaults()

    def reset_to_default(self, *, migration_mode: str = "move") -> ModelStorageConfig:
        return self.set_root(None, migration_mode=migration_mode)

    def set_root(self, root_dir: str | None, *, persist: bool = True, migration_mode: str = "move") -> ModelStorageConfig:
        if model_installer_service.has_active_installs():
            raise RuntimeError("Cannot change the model directory while installs are running")

        old_root = Path(settings.models_dir).expanduser().resolve()
        old_rembg_dir = Path(settings.rembg_models_dir).expanduser().resolve()
        new_root = self.default_root if not root_dir else Path(root_dir).expanduser().resolve()
        new_rembg_dir = (new_root / "rembg").resolve()

        new_root.mkdir(parents=True, exist_ok=True)
        new_rembg_dir.mkdir(parents=True, exist_ok=True)

        if old_rembg_dir != new_rembg_dir:
            self._handle_known_models(old_rembg_dir, new_rembg_dir, migration_mode=migration_mode)

        settings.models_dir = new_root
        settings.rembg_models_dir = new_rembg_dir

        if persist:
            if new_root == self.default_root:
                app_settings_store.delete(MODELS_ROOT_KEY)
            else:
                app_settings_store.set(MODELS_ROOT_KEY, str(new_root))

        model_catalog_service.bootstrap_bundled_defaults()
        clear_rembg_session_cache()
        model_catalog_service.refresh_state()
        return self.get_config()

    def _handle_known_models(self, old_dir: Path, new_dir: Path, *, migration_mode: str) -> None:
        if migration_mode not in {"move", "delete", "ignore"}:
            raise RuntimeError(f"Unsupported migration mode: {migration_mode}")

        states = model_state_store.list()
        for model_id, meta in model_catalog_service.catalog.items():
            filename = meta.get("filename")
            if not filename:
                continue

            source = old_dir / str(filename)
            target = new_dir / str(filename)
            if migration_mode == "move" and source.exists() and source.resolve() != target.resolve() and not target.exists():
                try:
                    shutil.move(str(source), str(target))
                except shutil.Error:
                    shutil.copy2(source, target)
                    source.unlink(missing_ok=True)
            elif migration_mode == "delete" and source.exists() and source.resolve() != target.resolve():
                source.unlink(missing_ok=True)

            if target.exists() and migration_mode != "ignore":
                previous = states.get(str(model_id), {})
                model_state_store.upsert(
                    str(model_id),
                    install_state="installed",
                    local_path=str(target),
                    last_error=None,
                    last_used_at=previous.get("last_used_at"),
                    checksum=model_state_store.sha256_for(target),
                )
            elif migration_mode in {"delete", "ignore"}:
                previous = states.get(str(model_id), {})
                model_state_store.upsert(
                    str(model_id),
                    install_state="not_installed",
                    local_path=None,
                    last_error=None,
                    last_used_at=previous.get("last_used_at"),
                    checksum=previous.get("checksum"),
                )


model_storage_service = ModelStorageService()
