#!/usr/bin/env python3
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT / "backend"
ENTRYPOINT = BACKEND_DIR / "desktop_entry.py"
BUILD_DIR = ROOT / ".build" / "pyinstaller"
DIST_DIR = ROOT / "src-tauri" / "resources" / "backend"
EXECUTABLE_NAME = "ipu-backend.exe" if sys.platform.startswith("win") else "ipu-backend"


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def main() -> int:
    if not ENTRYPOINT.exists():
        raise SystemExit(f"Backend entrypoint not found: {ENTRYPOINT}")

    pyinstaller = shutil.which("pyinstaller")
    if not pyinstaller:
        raise SystemExit("PyInstaller is required. Install it with: pip install pyinstaller")

    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    DIST_DIR.mkdir(parents=True, exist_ok=True)

    run(
        [
            pyinstaller,
            "--noconfirm",
            "--clean",
            "--onefile",
            "--name",
            "ipu-backend",
            "--collect-all",
            "app",
            "--hidden-import",
            "app.main",
            "--distpath",
            str(DIST_DIR),
            "--workpath",
            str(BUILD_DIR / "work"),
            "--specpath",
            str(BUILD_DIR / "spec"),
            "--paths",
            str(BACKEND_DIR),
            str(ENTRYPOINT),
        ]
    )

    target = DIST_DIR / EXECUTABLE_NAME
    if not target.exists():
        raise SystemExit(f"Expected bundled backend executable not found: {target}")

    print(f"Bundled backend sidecar: {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
