import hashlib
import os
from datetime import datetime
from pathlib import Path

from app.core.config import settings
from app.storage.sqlite import connect as sqlite_connect


class ModelStateStore:
    def __init__(self) -> None:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = settings.data_dir / "models.db"
        self._init_db()

    def _connect(self):
        return sqlite_connect(self.db_path)

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS model_state (
                    id TEXT PRIMARY KEY,
                    install_state TEXT NOT NULL,
                    local_path TEXT,
                    last_error TEXT,
                    last_used_at TEXT,
                    checksum TEXT,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.commit()

    def get(self, model_id: str) -> dict | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM model_state WHERE id = ?", (model_id,)).fetchone()
        return dict(row) if row else None

    def list(self) -> dict[str, dict]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM model_state").fetchall()
        return {row["id"]: dict(row) for row in rows}

    def upsert(
        self,
        model_id: str,
        *,
        install_state: str,
        local_path: str | None = None,
        last_error: str | None = None,
        last_used_at: str | None = None,
        checksum: str | None = None,
    ) -> dict:
        updated_at = datetime.utcnow().isoformat()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO model_state (id, install_state, local_path, last_error, last_used_at, checksum, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    install_state=excluded.install_state,
                    local_path=excluded.local_path,
                    last_error=excluded.last_error,
                    last_used_at=COALESCE(excluded.last_used_at, model_state.last_used_at),
                    checksum=COALESCE(excluded.checksum, model_state.checksum),
                    updated_at=excluded.updated_at
                """,
                (model_id, install_state, local_path, last_error, last_used_at, checksum, updated_at),
            )
            conn.commit()
        return self.get(model_id) or {}

    def mark_used(self, model_id: str) -> None:
        state = self.get(model_id) or {}
        self.upsert(
            model_id,
            install_state=state.get("install_state", "installed"),
            local_path=state.get("local_path"),
            last_error=state.get("last_error"),
            last_used_at=datetime.utcnow().isoformat(),
            checksum=state.get("checksum"),
        )

    def delete(self, model_id: str) -> bool:
        state = self.get(model_id)
        if state and state.get("local_path"):
            try:
                Path(str(state["local_path"])).unlink(missing_ok=True)
            except OSError:
                pass
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM model_state WHERE id = ?", (model_id,))
            conn.commit()
        return cur.rowcount > 0

    @staticmethod
    def sha256_for(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    @staticmethod
    def file_size_mb(path: Path) -> float:
        return round(os.path.getsize(path) / (1024 * 1024), 2)


model_state_store = ModelStateStore()
