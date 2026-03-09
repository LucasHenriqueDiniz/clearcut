import sqlite3
from datetime import datetime
from pathlib import Path
from app.core.config import settings


class HistoryStore:
    def __init__(self) -> None:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = settings.data_dir / "history.db"
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    original_filename TEXT NOT NULL,
                    output_filename TEXT NOT NULL,
                    engine_used TEXT NOT NULL,
                    provider_used TEXT NOT NULL,
                    processing_options TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    success INTEGER NOT NULL,
                    error_message TEXT,
                    input_path TEXT NOT NULL,
                    output_path TEXT NOT NULL
                )
                """
            )
            conn.commit()

    def add(self, data: dict) -> int:
        with self._connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO history (
                    original_filename, output_filename, engine_used, provider_used,
                    processing_options, created_at, success, error_message, input_path, output_path
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    data["original_filename"],
                    data["output_filename"],
                    data["engine_used"],
                    data["provider_used"],
                    data["processing_options"],
                    datetime.utcnow().isoformat(),
                    1 if data.get("success", True) else 0,
                    data.get("error_message"),
                    data["input_path"],
                    data["output_path"],
                ),
            )
            conn.commit()
            return int(cur.lastrowid)

    def list(self, limit: int = 200) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM history ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
            return [dict(row) for row in rows]

    def delete(self, item_id: int) -> bool:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM history WHERE id = ?", (item_id,))
            conn.commit()
            return cur.rowcount > 0


history_store = HistoryStore()
