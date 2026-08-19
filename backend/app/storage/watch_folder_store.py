import sqlite3
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from app.core.config import settings
from app.storage.sqlite import connect as sqlite_connect
from app.schemas.watch_folders import WatchFolderCreateRequest, WatchFolderItem, WatchFolderUpdateRequest


class WatchFolderStore:
    def __init__(self) -> None:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = settings.data_dir / "watch_folders.db"
        self._init_db()

    def _connect(self):
        return sqlite_connect(self.db_path)

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS watch_folders (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    input_folder TEXT NOT NULL,
                    output_folder TEXT NOT NULL,
                    preset_id TEXT NOT NULL,
                    is_enabled INTEGER NOT NULL,
                    auto_run INTEGER NOT NULL,
                    skip_duplicates INTEGER NOT NULL,
                    move_processed_files INTEGER NOT NULL,
                    processed_folder TEXT,
                    move_failed_files INTEGER NOT NULL,
                    failed_folder TEXT,
                    cooldown_ms INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    files_processed_count INTEGER NOT NULL DEFAULT 0,
                    last_processed_at TEXT,
                    last_activity_at TEXT,
                    last_error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS watch_folder_seen_files (
                    watch_folder_id TEXT NOT NULL,
                    source_path TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    mtime_ns INTEGER NOT NULL,
                    seen_at TEXT NOT NULL,
                    PRIMARY KEY (watch_folder_id, source_path, size, mtime_ns)
                )
                """
            )
            conn.commit()

    def _row_to_item(self, row: sqlite3.Row, *, preset_missing: bool = False) -> WatchFolderItem:
        return WatchFolderItem(
            id=row["id"],
            name=row["name"],
            input_folder=row["input_folder"],
            output_folder=row["output_folder"],
            preset_id=row["preset_id"],
            is_enabled=bool(row["is_enabled"]),
            auto_run=bool(row["auto_run"]),
            skip_duplicates=bool(row["skip_duplicates"]),
            move_processed_files=bool(row["move_processed_files"]),
            processed_folder=row["processed_folder"],
            move_failed_files=bool(row["move_failed_files"]),
            failed_folder=row["failed_folder"],
            cooldown_ms=int(row["cooldown_ms"]),
            status=row["status"],
            files_processed_count=int(row["files_processed_count"]),
            last_processed_at=datetime.fromisoformat(row["last_processed_at"]) if row["last_processed_at"] else None,
            last_activity_at=datetime.fromisoformat(row["last_activity_at"]) if row["last_activity_at"] else None,
            last_error=row["last_error"],
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
            preset_missing=preset_missing,
        )

    def list(self) -> list[WatchFolderItem]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM watch_folders ORDER BY created_at DESC").fetchall()
        return [self._row_to_item(row) for row in rows]

    def get(self, watch_folder_id: str) -> WatchFolderItem | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM watch_folders WHERE id = ?", (watch_folder_id,)).fetchone()
        return self._row_to_item(row) if row else None

    def create(self, payload: WatchFolderCreateRequest) -> WatchFolderItem:
        now = datetime.utcnow().isoformat()
        watch_folder_id = uuid4().hex
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO watch_folders (
                    id, name, input_folder, output_folder, preset_id,
                    is_enabled, auto_run, skip_duplicates, move_processed_files,
                    processed_folder, move_failed_files, failed_folder,
                    cooldown_ms, status, files_processed_count, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
                """,
                (
                    watch_folder_id,
                    payload.name.strip(),
                    str(Path(payload.input_folder).expanduser().resolve()),
                    str(Path(payload.output_folder).expanduser().resolve()),
                    payload.preset_id,
                    1 if payload.is_enabled else 0,
                    1 if payload.auto_run else 0,
                    1 if payload.skip_duplicates else 0,
                    1 if payload.move_processed_files else 0,
                    str(Path(payload.processed_folder).expanduser().resolve()) if payload.processed_folder else None,
                    1 if payload.move_failed_files else 0,
                    str(Path(payload.failed_folder).expanduser().resolve()) if payload.failed_folder else None,
                    payload.cooldown_ms,
                    "paused" if not payload.is_enabled else "idle",
                    now,
                    now,
                ),
            )
            conn.commit()
        item = self.get(watch_folder_id)
        if not item:
            raise RuntimeError("Watch folder could not be created")
        return item

    def update(self, watch_folder_id: str, payload: WatchFolderUpdateRequest) -> WatchFolderItem:
        current = self.get(watch_folder_id)
        if not current:
            raise KeyError("Watch folder not found")
        data = current.model_dump()
        for key, value in payload.model_dump(exclude_unset=True).items():
            data[key] = value
        normalized = WatchFolderCreateRequest.model_validate(data)
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE watch_folders
                SET name = ?, input_folder = ?, output_folder = ?, preset_id = ?,
                    is_enabled = ?, auto_run = ?, skip_duplicates = ?,
                    move_processed_files = ?, processed_folder = ?,
                    move_failed_files = ?, failed_folder = ?, cooldown_ms = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    normalized.name.strip(),
                    str(Path(normalized.input_folder).expanduser().resolve()),
                    str(Path(normalized.output_folder).expanduser().resolve()),
                    normalized.preset_id,
                    1 if normalized.is_enabled else 0,
                    1 if normalized.auto_run else 0,
                    1 if normalized.skip_duplicates else 0,
                    1 if normalized.move_processed_files else 0,
                    str(Path(normalized.processed_folder).expanduser().resolve()) if normalized.processed_folder else None,
                    1 if normalized.move_failed_files else 0,
                    str(Path(normalized.failed_folder).expanduser().resolve()) if normalized.failed_folder else None,
                    normalized.cooldown_ms,
                    datetime.utcnow().isoformat(),
                    watch_folder_id,
                ),
            )
            conn.commit()
        item = self.get(watch_folder_id)
        if not item:
            raise RuntimeError("Watch folder could not be updated")
        return item

    def delete(self, watch_folder_id: str) -> bool:
        with self._connect() as conn:
            conn.execute("DELETE FROM watch_folder_seen_files WHERE watch_folder_id = ?", (watch_folder_id,))
            cur = conn.execute("DELETE FROM watch_folders WHERE id = ?", (watch_folder_id,))
            conn.commit()
        return cur.rowcount > 0

    def set_enabled(self, watch_folder_id: str, enabled: bool) -> WatchFolderItem:
        with self._connect() as conn:
            conn.execute(
                "UPDATE watch_folders SET is_enabled = ?, status = ?, updated_at = ? WHERE id = ?",
                (1 if enabled else 0, "idle" if enabled else "paused", datetime.utcnow().isoformat(), watch_folder_id),
            )
            conn.commit()
        item = self.get(watch_folder_id)
        if not item:
            raise KeyError("Watch folder not found")
        return item

    def update_runtime(
        self,
        watch_folder_id: str,
        *,
        status: str | None = None,
        last_error: str | None = None,
        last_activity_at: datetime | None = None,
        last_processed_at: datetime | None = None,
        increment_processed: bool = False,
    ) -> None:
        current = self.get(watch_folder_id)
        if not current:
            return
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE watch_folders
                SET status = ?, last_error = ?, last_activity_at = ?, last_processed_at = ?,
                    files_processed_count = files_processed_count + ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    status or current.status,
                    last_error,
                    (last_activity_at or current.last_activity_at or datetime.utcnow()).isoformat()
                    if (last_activity_at or current.last_activity_at)
                    else None,
                    last_processed_at.isoformat() if last_processed_at else current.last_processed_at.isoformat() if current.last_processed_at else None,
                    1 if increment_processed else 0,
                    datetime.utcnow().isoformat(),
                    watch_folder_id,
                ),
            )
            conn.commit()

    def has_seen_file(self, watch_folder_id: str, source_path: str, size: int, mtime_ns: int) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT 1 FROM watch_folder_seen_files
                WHERE watch_folder_id = ? AND source_path = ? AND size = ? AND mtime_ns = ?
                """,
                (watch_folder_id, source_path, size, mtime_ns),
            ).fetchone()
        return row is not None

    def mark_seen_file(self, watch_folder_id: str, source_path: str, size: int, mtime_ns: int) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR IGNORE INTO watch_folder_seen_files (watch_folder_id, source_path, size, mtime_ns, seen_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (watch_folder_id, source_path, size, mtime_ns, datetime.utcnow().isoformat()),
            )
            conn.commit()


watch_folder_store = WatchFolderStore()
