import shutil
import mimetypes
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from threading import Lock
from fastapi import UploadFile
from slugify import slugify
from app.core.config import settings


@dataclass(frozen=True)
class UploadEntry:
    upload_id: str
    filename: str
    size: int
    mime_type: str
    path: str
    source_path: str | None
    storage_mode: str


class FileStorage:
    def __init__(self) -> None:
        self.upload_dir = settings.upload_dir
        self.output_dir = settings.output_dir
        self._entries: dict[str, UploadEntry] = {}
        self._entries_lock = Lock()
        self._ensure_dirs()

    def _ensure_dirs(self) -> None:
        (self.output_dir / "png").mkdir(parents=True, exist_ok=True)
        (self.output_dir / "webp").mkdir(parents=True, exist_ok=True)
        (self.output_dir / "jpg").mkdir(parents=True, exist_ok=True)
        (self.output_dir / "masks").mkdir(parents=True, exist_ok=True)
        (self.output_dir / "tmp").mkdir(parents=True, exist_ok=True)
        (self.output_dir / "zips").mkdir(parents=True, exist_ok=True)
        settings.logs_dir.mkdir(parents=True, exist_ok=True)
        settings.models_dir.mkdir(parents=True, exist_ok=True)
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    def _register_entry(self, entry: UploadEntry) -> UploadEntry:
        with self._entries_lock:
            self._entries[entry.upload_id] = entry
        return entry

    def get_entry(self, upload_id: str) -> UploadEntry | None:
        with self._entries_lock:
            return self._entries.get(upload_id)

    def save_upload(self, file: UploadFile) -> UploadEntry:
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
        stem = slugify(Path(file.filename or "image").stem) or "image"
        ext = Path(file.filename or ".png").suffix.lower() or ".png"
        upload_id = f"{timestamp}_{stem}"
        final_name = f"{upload_id}{ext}"
        dest = self.upload_dir / final_name
        with dest.open("wb") as out:
            shutil.copyfileobj(file.file, out)
        entry = UploadEntry(
            upload_id=upload_id,
            filename=file.filename or final_name,
            size=dest.stat().st_size,
            mime_type=file.content_type or mimetypes.guess_type(dest.name)[0] or "application/octet-stream",
            path=str(dest.resolve()),
            source_path=None,
            storage_mode="uploaded_blob",
        )
        return self._register_entry(entry)

    def register_local_path(self, source: Path) -> UploadEntry:
        resolved = source.resolve()
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
        stem = slugify(resolved.stem) or "image"
        upload_id = f"{timestamp}_{stem}"
        entry = UploadEntry(
            upload_id=upload_id,
            filename=resolved.name,
            size=resolved.stat().st_size,
            mime_type=mimetypes.guess_type(resolved.name)[0] or "application/octet-stream",
            path=str(resolved),
            source_path=str(resolved),
            storage_mode="desktop_path",
        )
        return self._register_entry(entry)

    def output_path_for(self, filename: str, output_format: str) -> Path:
        folder = "jpg" if output_format in {"jpg", "jpeg"} else output_format
        folder_path = self.output_dir / folder
        folder_path.mkdir(parents=True, exist_ok=True)
        return folder_path / f"{filename}.{output_format if output_format != 'jpg' else 'jpeg'}"

    def mask_output_path_for(self, filename: str) -> Path:
        return self.output_dir / "masks" / f"{filename}_mask.png"

    def zip_path_for(self, base_name: str) -> Path:
        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        return self.output_dir / "zips" / f"{slugify(base_name)}_{ts}.zip"


storage = FileStorage()
