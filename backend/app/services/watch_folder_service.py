from __future__ import annotations

import logging
import os
import shutil
import threading
import time
from datetime import datetime
from pathlib import Path

from app.core.config import settings
from app.schemas.jobs import JobExecutionConfig, ProcessingOptions
from app.schemas.watch_folders import (
    WatchFolderCreateRequest,
    WatchFolderItem,
    WatchFolderUpdateRequest,
)
from app.services.job_service import job_service
from app.storage.preset_store import preset_store
from app.storage.watch_folder_store import watch_folder_store
from app.utils.file_types import is_supported_input

logger = logging.getLogger(__name__)

try:
    from watchdog.events import FileSystemEventHandler
    from watchdog.observers import Observer
except Exception:  # pragma: no cover
    FileSystemEventHandler = object  # type: ignore[assignment]
    Observer = None  # type: ignore[assignment]


TEMP_SUFFIXES = {".tmp", ".part", ".crdownload", ".download"}


def _normalize(path: str | Path) -> Path:
    return Path(path).expanduser().resolve()


def _paths_overlap(left: Path, right: Path) -> bool:
    if left == right:
        return True
    try:
        right.relative_to(left)
        return True
    except ValueError:
        pass
    try:
        left.relative_to(right)
        return True
    except ValueError:
        return False


class WatchFolderEventHandler(FileSystemEventHandler):
    def __init__(self, service: "WatchFolderService", watch_folder_id: str) -> None:
        self.service = service
        self.watch_folder_id = watch_folder_id

    def on_created(self, event) -> None:  # pragma: no cover - filesystem driven
        if event.is_directory:
            return
        self.service.queue_event(self.watch_folder_id, event.src_path)

    def on_moved(self, event) -> None:  # pragma: no cover - filesystem driven
        if event.is_directory:
            return
        self.service.queue_event(self.watch_folder_id, event.dest_path)


class WatchFolderService:
    def __init__(self) -> None:
        self._observer = None
        self._observer_lock = threading.Lock()
        self._handlers: dict[str, WatchFolderEventHandler] = {}
        self._timers: dict[tuple[str, str], threading.Timer] = {}
        self._started = False
        self._listener_registered = False
        self._supported = Observer is not None and not settings.running_in_docker

    def _ensure_listener(self) -> None:
        if self._listener_registered:
            return
        job_service.register_completion_listener(self.handle_job_completion)
        self._listener_registered = True

    def validate_payload(self, payload: WatchFolderCreateRequest) -> None:
        input_folder = _normalize(payload.input_folder)
        output_folder = _normalize(payload.output_folder)
        if not input_folder.exists() or not input_folder.is_dir():
            raise ValueError("Input folder must exist and be a directory")
        output_folder.mkdir(parents=True, exist_ok=True)
        paths_to_check = [("output folder", output_folder)]
        if payload.move_processed_files:
            if not payload.processed_folder:
                raise ValueError("Processed folder is required when move_processed_files is enabled")
            processed_folder = _normalize(payload.processed_folder)
            processed_folder.mkdir(parents=True, exist_ok=True)
            paths_to_check.append(("processed folder", processed_folder))
        if payload.move_failed_files:
            if not payload.failed_folder:
                raise ValueError("Failed folder is required when move_failed_files is enabled")
            failed_folder = _normalize(payload.failed_folder)
            failed_folder.mkdir(parents=True, exist_ok=True)
            paths_to_check.append(("failed folder", failed_folder))
        for label, candidate in paths_to_check:
            if _paths_overlap(input_folder, candidate):
                raise ValueError(f"Input folder cannot overlap with {label}")

    def start(self) -> None:
        self._ensure_listener()
        if self._started:
            self.sync()
            return
        self._started = True
        self.sync()

    def sync(self) -> None:
        if not self._supported:
            for item in watch_folder_store.list():
                watch_folder_store.update_runtime(item.id, status="unsupported", last_error="Watch folders are unavailable in this runtime")
            return
        with self._observer_lock:
            if self._observer is not None:
                self._observer.stop()
                self._observer.join(timeout=2)
            self._observer = Observer()
            self._handlers = {}

            for item in watch_folder_store.list():
                if not item.is_enabled:
                    watch_folder_store.update_runtime(item.id, status="paused", last_error=None)
                    continue
                if not preset_store.get(item.preset_id):
                    watch_folder_store.update_runtime(item.id, status="error", last_error="Preset no longer exists")
                    continue
                handler = WatchFolderEventHandler(self, item.id)
                try:
                    self._observer.schedule(handler, item.input_folder, recursive=False)
                except OSError as exc:
                    watch_folder_store.update_runtime(item.id, status="error", last_error=str(exc))
                    continue
                self._handlers[item.id] = handler
                watch_folder_store.update_runtime(item.id, status="watching", last_error=None)

            self._observer.start()

    def stop(self) -> None:
        with self._observer_lock:
            if self._observer is None:
                return
            self._observer.stop()
            self._observer.join(timeout=2)
            self._observer = None

    def list_watch_folders(self) -> list[WatchFolderItem]:
        items = watch_folder_store.list()
        if not self._supported:
            return [item.model_copy(update={"status": "unsupported", "last_error": "Watch folders are unavailable in this runtime"}) for item in items]
        out: list[WatchFolderItem] = []
        for item in items:
            preset_missing = preset_store.get(item.preset_id) is None
            if preset_missing:
                item = item.model_copy(update={"preset_missing": True, "status": "error", "last_error": item.last_error or "Preset no longer exists"})
            out.append(item)
        return out

    def get_watch_folder(self, watch_folder_id: str) -> WatchFolderItem | None:
        return next((item for item in self.list_watch_folders() if item.id == watch_folder_id), None)

    def create_watch_folder(self, payload: WatchFolderCreateRequest) -> WatchFolderItem:
        self.validate_payload(payload)
        item = watch_folder_store.create(payload)
        self.sync()
        return self.get_watch_folder(item.id) or item

    def update_watch_folder(self, watch_folder_id: str, payload: WatchFolderUpdateRequest) -> WatchFolderItem:
        current = watch_folder_store.get(watch_folder_id)
        if not current:
            raise KeyError("Watch folder not found")
        data = current.model_dump()
        for key, value in payload.model_dump(exclude_unset=True).items():
            data[key] = value
        normalized = WatchFolderCreateRequest.model_validate(data)
        self.validate_payload(normalized)
        item = watch_folder_store.update(watch_folder_id, payload)
        self.sync()
        return self.get_watch_folder(item.id) or item

    def delete_watch_folder(self, watch_folder_id: str) -> bool:
        deleted = watch_folder_store.delete(watch_folder_id)
        if deleted:
            self.sync()
        return deleted

    def set_enabled(self, watch_folder_id: str, enabled: bool) -> WatchFolderItem:
        item = watch_folder_store.set_enabled(watch_folder_id, enabled)
        self.sync()
        return self.get_watch_folder(item.id) or item

    def queue_event(self, watch_folder_id: str, raw_path: str) -> None:
        item = watch_folder_store.get(watch_folder_id)
        if not item or not item.is_enabled:
            return
        path = _normalize(raw_path)
        if not self._should_consider(path):
            return
        timer_key = (watch_folder_id, str(path))
        existing = self._timers.get(timer_key)
        if existing:
            existing.cancel()
        timer = threading.Timer(item.cooldown_ms / 1000.0, self._process_candidate, args=(watch_folder_id, path))
        timer.daemon = True
        self._timers[timer_key] = timer
        timer.start()

    def _should_consider(self, path: Path) -> bool:
        if not path.exists() or not path.is_file():
            return False
        if path.name.startswith("."):
            return False
        if path.suffix.lower() in TEMP_SUFFIXES:
            return False
        return is_supported_input(path)

    def _wait_until_stable(self, path: Path, attempts: int = 8, sleep_seconds: float = 0.5) -> os.stat_result | None:
        last_signature: tuple[int, int] | None = None
        stable_hits = 0
        for _ in range(attempts):
            try:
                stat = path.stat()
            except OSError:
                return None
            signature = (stat.st_size, stat.st_mtime_ns)
            if signature == last_signature:
                stable_hits += 1
                if stable_hits >= 2:
                    return stat
            else:
                stable_hits = 0
            last_signature = signature
            time.sleep(sleep_seconds)
        return None

    def _process_candidate(self, watch_folder_id: str, path: Path) -> None:
        self._timers.pop((watch_folder_id, str(path)), None)
        item = watch_folder_store.get(watch_folder_id)
        if not item or not item.is_enabled or not item.auto_run:
            return
        if not self._should_consider(path):
            return
        stat = self._wait_until_stable(path)
        if stat is None:
            watch_folder_store.update_runtime(
                watch_folder_id,
                status="error",
                last_error=f"File did not stabilize before timeout: {path.name}",
                last_activity_at=datetime.utcnow(),
            )
            return

        resolved = str(path.resolve())
        if item.skip_duplicates and watch_folder_store.has_seen_file(watch_folder_id, resolved, stat.st_size, stat.st_mtime_ns):
            return
        if item.skip_duplicates and job_service.has_file_in_flight(path):
            return

        preset = preset_store.get(item.preset_id)
        if not preset:
            watch_folder_store.update_runtime(
                watch_folder_id,
                status="error",
                last_error="Preset no longer exists",
                last_activity_at=datetime.utcnow(),
            )
            return

        execution_config = JobExecutionConfig(
            output_dir_override=item.output_folder,
            source="watch_folder",
            watch_folder_id=watch_folder_id,
        )
        options = ProcessingOptions.model_validate(preset.options.model_dump())
        options.preset = preset.id
        watch_folder_store.mark_seen_file(watch_folder_id, resolved, stat.st_size, stat.st_mtime_ns)
        watch_folder_store.update_runtime(
            watch_folder_id,
            status="watching",
            last_error=None,
            last_activity_at=datetime.utcnow(),
        )
        job_service.create_job([path], options, execution_config=execution_config)

    def _move_file(self, source_path: str, target_dir: str | None) -> None:
        if not target_dir:
            return
        source = _normalize(source_path)
        destination_dir = _normalize(target_dir)
        destination_dir.mkdir(parents=True, exist_ok=True)
        destination = destination_dir / source.name
        if destination.exists():
            stem = source.stem
            suffix = source.suffix
            destination = destination_dir / f"{stem}_{int(time.time())}{suffix}"
        shutil.move(str(source), str(destination))

    def handle_job_completion(self, job, file_item) -> None:
        execution_config = getattr(job, "execution_config", None)
        if not execution_config or execution_config.source != "watch_folder" or not execution_config.watch_folder_id:
            return
        watch_folder_id = execution_config.watch_folder_id
        item = watch_folder_store.get(watch_folder_id)
        if not item:
            return

        finished_at = file_item.finished_at or datetime.utcnow()
        if file_item.state == "done":
            watch_folder_store.update_runtime(
                watch_folder_id,
                status="watching",
                last_error=None,
                last_activity_at=finished_at,
                last_processed_at=finished_at,
                increment_processed=True,
            )
            if item.move_processed_files:
                try:
                    self._move_file(file_item.input_path, item.processed_folder)
                except Exception as exc:
                    watch_folder_store.update_runtime(
                        watch_folder_id,
                        status="error",
                        last_error=f"Processed-file move failed: {exc}",
                        last_activity_at=finished_at,
                    )
        elif file_item.state == "failed":
            watch_folder_store.update_runtime(
                watch_folder_id,
                status="error",
                last_error=file_item.error_message or "Watch folder job failed",
                last_activity_at=finished_at,
            )
            if item.move_failed_files:
                try:
                    self._move_file(file_item.input_path, item.failed_folder)
                except Exception as exc:
                    watch_folder_store.update_runtime(
                        watch_folder_id,
                        status="error",
                        last_error=f"Failed-file move failed: {exc}",
                        last_activity_at=finished_at,
                    )


watch_folder_service = WatchFolderService()
