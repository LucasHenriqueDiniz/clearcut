from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class ProviderResult:
    content: bytes
    engine_used: str
    provider_used: str
    confidence: float = 0.0


class BackgroundRemovalProvider(ABC):
    name: str
    is_local: bool

    @abstractmethod
    def health(self) -> tuple[bool, str | None]:
        raise NotImplementedError

    @abstractmethod
    def remove_background(self, image_bytes: bytes, *, model: Optional[str] = None, api_key: Optional[str] = None) -> ProviderResult:
        raise NotImplementedError
