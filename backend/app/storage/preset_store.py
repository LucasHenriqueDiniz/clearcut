import json
import sqlite3
from copy import deepcopy
from datetime import datetime

from app.core.config import settings
from app.storage.sqlite import connect as sqlite_connect
from app.schemas.jobs import ProcessingOptions
from app.schemas.presets import CreatePresetRequest, PresetItem, UpdatePresetRequest


def _base_options() -> dict:
    return {
        "workflow_mode": "cutout_only",
        "processing_order": "cutout_then_enhance",
        "provider_priority": ["rembg_local"],
        "remove_background": True,
        "cutout_engine": "rembg",
        "cutout_model_id": "u2netp",
        "local_quality_preset": "balanced",
        "enhance_level": "off",
        "enhance_engine": "realesrgan",
        "enhance_model": None,
        "preprocess_denoise": False,
        "preprocess_color_normalization": False,
        "preprocess_sharpening": False,
        "fallback_to_api": False,
        "trim_transparent_bounds": True,
        "padding": 0,
        "resize_mode": "keep",
        "resize_max_width": None,
        "resize_max_height": None,
        "aspect_ratio": "keep",
        "background_mode": "transparent",
        "background_color": "#ffffff",
        "output_dir_override": None,
        "output_format": "png",
        "quality": 90,
        "strip_metadata": True,
        "naming_mode": "pattern",
        "filename_pattern": "{original_name}_{preset}_{engine}",
        "naming_regex_find": "",
        "naming_regex_replace": "",
        "ocr_language": "eng",
        "ocr_max_length": 48,
        "alpha_threshold": 10,
        "edge_feather_radius": 1,
        "white_halo_cleanup": 35,
        "save_alpha_mask": False,
    }


def _preset_options(preset_id: str, **overrides: object) -> ProcessingOptions:
    payload = _base_options()
    payload["preset"] = preset_id
    payload.update(overrides)
    return ProcessingOptions.model_validate(payload)


BUILTIN_PRESETS: list[dict] = [
    {
        "id": "quick_cutout",
        "name": "Quick Cutout",
        "options": _preset_options(
            "quick_cutout",
            cutout_model_id="birefnet-general-lite",
            local_quality_preset="balanced",
            output_format="png",
            quality=95,
        ),
    },
    {
        "id": "product_image",
        "name": "Product Image",
        "options": _preset_options(
            "product_image",
            cutout_model_id="birefnet-general",
            local_quality_preset="hq",
            padding=24,
            output_format="webp",
            quality=90,
        ),
    },
    {
        "id": "portrait",
        "name": "Portrait",
        "options": _preset_options(
            "portrait",
            cutout_model_id="birefnet-general",
            local_quality_preset="hq",
            output_format="png",
            quality=100,
        ),
    },
    {
        "id": "anime_art",
        "name": "Anime / Art",
        "options": _preset_options(
            "anime_art",
            cutout_model_id="u2netp",
            local_quality_preset="fast",
            output_format="png",
            quality=100,
        ),
    },
    {
        "id": "convert_only",
        "name": "Convert Only",
        "options": _preset_options(
            "convert_only",
            remove_background=False,
            trim_transparent_bounds=False,
            output_format="png",
            quality=92,
        ),
    },
    {
        "id": "remove_trim_webp",
        "name": "Remove + Trim + WebP",
        "options": _preset_options(
            "remove_trim_webp",
            cutout_model_id="birefnet-general-lite",
            local_quality_preset="balanced",
            output_format="webp",
            quality=86,
        ),
    },
]


class PresetStore:
    def __init__(self) -> None:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = settings.data_dir / "presets.db"
        self._init_db()
        self._seed_builtins()

    def _connect(self):
        return sqlite_connect(self.db_path)

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS presets (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    is_builtin INTEGER NOT NULL,
                    is_editable INTEGER NOT NULL,
                    options_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.commit()

    def _seed_builtins(self) -> None:
        now = datetime.utcnow().isoformat()
        with self._connect() as conn:
            for preset in BUILTIN_PRESETS:
                conn.execute(
                    """
                    INSERT INTO presets (id, name, is_builtin, is_editable, options_json, created_at, updated_at)
                    VALUES (?, ?, 1, 0, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        name=excluded.name,
                        is_builtin=1,
                        is_editable=0,
                        options_json=excluded.options_json
                    """,
                    (
                        preset["id"],
                        preset["name"],
                        preset["options"].model_dump_json(),
                        now,
                        now,
                    ),
                )
            conn.commit()

    def _row_to_item(self, row: sqlite3.Row) -> PresetItem:
        return PresetItem(
            id=row["id"],
            name=row["name"],
            is_builtin=bool(row["is_builtin"]),
            is_editable=bool(row["is_editable"]),
            options=ProcessingOptions.model_validate_json(row["options_json"]),
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )

    def list(self) -> list[PresetItem]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM presets ORDER BY is_builtin DESC, name ASC").fetchall()
        return [self._row_to_item(row) for row in rows]

    def get(self, preset_id: str) -> PresetItem | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM presets WHERE id = ?", (preset_id,)).fetchone()
        return self._row_to_item(row) if row else None

    def create(self, payload: CreatePresetRequest) -> PresetItem:
        now = datetime.utcnow().isoformat()
        preset_id = payload.options.preset or payload.name.strip().lower().replace(" ", "_")
        preset_id = preset_id.strip().lower().replace(" ", "_")
        with self._connect() as conn:
            existing = conn.execute("SELECT id FROM presets WHERE id = ?", (preset_id,)).fetchone()
            if existing:
                suffix = int(datetime.utcnow().timestamp())
                preset_id = f"{preset_id}_{suffix}"
            options = deepcopy(payload.options.model_dump())
            options["preset"] = preset_id
            conn.execute(
                """
                INSERT INTO presets (id, name, is_builtin, is_editable, options_json, created_at, updated_at)
                VALUES (?, ?, 0, 1, ?, ?, ?)
                """,
                (
                    preset_id,
                    payload.name.strip(),
                    json.dumps(options),
                    now,
                    now,
                ),
            )
            conn.commit()
        item = self.get(preset_id)
        if not item:
            raise RuntimeError("Preset could not be created")
        return item

    def update(self, preset_id: str, payload: UpdatePresetRequest) -> PresetItem:
        current = self.get(preset_id)
        if not current:
            raise KeyError("Preset not found")
        if current.is_builtin:
            raise PermissionError("Built-in presets are read only")
        next_name = payload.name.strip() if payload.name else current.name
        next_options = current.options if payload.options is None else payload.options
        data = deepcopy(next_options.model_dump())
        data["preset"] = preset_id
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE presets
                SET name = ?, options_json = ?, updated_at = ?
                WHERE id = ?
                """,
                (next_name, json.dumps(data), datetime.utcnow().isoformat(), preset_id),
            )
            conn.commit()
        item = self.get(preset_id)
        if not item:
            raise RuntimeError("Preset could not be updated")
        return item

    def delete(self, preset_id: str) -> bool:
        current = self.get(preset_id)
        if not current:
            return False
        if current.is_builtin:
            raise PermissionError("Built-in presets are read only")
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM presets WHERE id = ?", (preset_id,))
            conn.commit()
        return cur.rowcount > 0


preset_store = PresetStore()
