from datetime import datetime
from pydantic import BaseModel, Field

from app.schemas.jobs import ProcessingOptions


class PresetItem(BaseModel):
    id: str
    name: str
    is_builtin: bool = False
    is_editable: bool = True
    options: ProcessingOptions
    created_at: datetime
    updated_at: datetime


class CreatePresetRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    options: ProcessingOptions


class UpdatePresetRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    options: ProcessingOptions | None = None
