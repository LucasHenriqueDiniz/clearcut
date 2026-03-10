from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field


class ProviderApiKey(BaseModel):
    id: str
    label: str
    key: str
    enabled: bool = True
    priority: int = 100
    usage_notes: Optional[str] = None
    monthly_limit: Optional[int] = None
    daily_limit: Optional[int] = None
    used_count: int = 0
    last_success_at: Optional[datetime] = None
    last_error: Optional[str] = None
    cooldown_until: Optional[datetime] = None


class ProviderSettingsItem(BaseModel):
    name: str
    enabled: bool = True
    priority: int = 100
    keys: list[ProviderApiKey] = Field(default_factory=list)


class ProviderSettingsPayload(BaseModel):
    use_only_local: bool = False
    default_quality_preset: Literal["fast", "balanced", "hq"] = "balanced"
    providers: list[ProviderSettingsItem] = Field(default_factory=list)


class ProviderStatus(BaseModel):
    name: str
    enabled: bool
    available: bool
    is_local: bool
    priority: int
    key_count: int
    healthy: bool
    last_error: Optional[str] = None
