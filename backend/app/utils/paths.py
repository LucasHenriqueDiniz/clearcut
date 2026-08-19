from __future__ import annotations

import os
import threading
from pathlib import Path

from app.core.config import settings


class OutputPathGuard:
    """Allowlist of directories the API may serve files from.

    The backend listens on localhost without authentication, so any local
    process (including a page in the user's browser) can reach it. Without
    this guard, `?path=` turns those endpoints into arbitrary file reads.

    Base roots cover the managed upload/output folders. Custom destinations
    (per-job output overrides, watch folder outputs) register themselves as
    the app writes to them.
    """

    def __init__(self) -> None:
        self._extra_roots: set[str] = set()
        self._lock = threading.Lock()

    @staticmethod
    def _key(path: Path) -> str:
        return os.path.normcase(str(path))

    def _base_roots(self) -> list[Path]:
        roots = [settings.output_dir, settings.upload_dir]
        resolved: list[Path] = []
        for root in roots:
            try:
                resolved.append(Path(root).expanduser().resolve())
            except OSError:
                continue
        return resolved

    def register_root(self, path: Path | str | None) -> None:
        if not path:
            return
        try:
            resolved = Path(path).expanduser().resolve()
        except OSError:
            return
        with self._lock:
            self._extra_roots.add(self._key(resolved))

    def allowed_roots(self) -> list[str]:
        with self._lock:
            extra = set(self._extra_roots)
        return sorted({self._key(root) for root in self._base_roots()} | extra)

    def is_allowed(self, path: Path) -> bool:
        candidate = self._key(path)
        for root in self.allowed_roots():
            if candidate == root or candidate.startswith(root + os.sep):
                return True
        return False


output_path_guard = OutputPathGuard()


def resolve_served_path(raw_path: str) -> Path:
    """Resolve a client-supplied path, refusing anything outside the allowlist.

    Raises PermissionError when the path is out of bounds and FileNotFoundError
    when it does not point at a readable file.
    """
    try:
        resolved = Path(raw_path).expanduser().resolve()
    except (OSError, ValueError) as exc:
        raise FileNotFoundError(raw_path) from exc
    # Containment is checked after resolve(), so symlinks and ".." segments
    # are evaluated against their real target.
    if not output_path_guard.is_allowed(resolved):
        raise PermissionError(str(resolved))
    if not resolved.is_file():
        raise FileNotFoundError(str(resolved))
    return resolved
