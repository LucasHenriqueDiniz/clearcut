from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


WatchFolderStatusValue = Literal["idle", "watching", "paused", "error", "unsupported"]


class WatchFolderBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    input_folder: str
    output_folder: str
    preset_id: str
    is_enabled: bool = True
    auto_run: bool = True
    skip_duplicates: bool = True
    move_processed_files: bool = False
    processed_folder: str | None = None
    move_failed_files: bool = False
    failed_folder: str | None = None
    cooldown_ms: int = Field(default=2000, ge=250, le=60000)


class WatchFolderCreateRequest(WatchFolderBase):
    pass


class WatchFolderUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    input_folder: str | None = None
    output_folder: str | None = None
    preset_id: str | None = None
    is_enabled: bool | None = None
    auto_run: bool | None = None
    skip_duplicates: bool | None = None
    move_processed_files: bool | None = None
    processed_folder: str | None = None
    move_failed_files: bool | None = None
    failed_folder: str | None = None
    cooldown_ms: int | None = Field(default=None, ge=250, le=60000)


class WatchFolderItem(WatchFolderBase):
    id: str
    status: WatchFolderStatusValue = "idle"
    files_processed_count: int = 0
    last_processed_at: datetime | None = None
    last_activity_at: datetime | None = None
    last_error: str | None = None
    created_at: datetime
    updated_at: datetime
    preset_missing: bool = False
