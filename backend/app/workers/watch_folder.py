from dataclasses import dataclass
from pathlib import Path


@dataclass
class WatchFolderConfig:
    path: Path
    recursive: bool = True
    enabled: bool = False


class WatchFolderService:
    """Scaffold for future auto-ingest without coupling to current job queue."""

    def __init__(self) -> None:
        self.configs: list[WatchFolderConfig] = []

    def add_watch(self, config: WatchFolderConfig) -> None:
        self.configs.append(config)


watch_folder_service = WatchFolderService()
