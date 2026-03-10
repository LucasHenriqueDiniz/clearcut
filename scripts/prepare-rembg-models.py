#!/usr/bin/env python3
from __future__ import annotations

import os
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
BUILD_CACHE = ROOT / ".build" / "rembg-model-cache"
TARGET_DIR = ROOT / "src-tauri" / "resources" / "backend" / "models" / "rembg"

# Canonical model files we want to ship in the installer.
MODEL_MAP: dict[str, str] = {
    "u2netp": "u2netp.onnx",
    "birefnet-general-lite": "birefnet-general-lite.onnx",
    "birefnet-general": "birefnet-general.onnx",
}


def _download_model_if_needed(model_name: str, expected_filename: str) -> Path:
    destination = BUILD_CACHE / expected_filename
    if destination.exists():
        return destination

    os.environ["U2NET_HOME"] = str(BUILD_CACHE.resolve())

    try:
        from rembg import new_session
    except Exception as exc:  # pragma: no cover
        raise SystemExit(
            "rembg is required to prepare bundled models. "
            "Install backend requirements first."
        ) from exc

    before = {p.resolve() for p in BUILD_CACHE.glob("*.onnx")}
    # Triggers download into U2NET_HOME if missing.
    new_session(model_name=model_name)
    after = [p.resolve() for p in BUILD_CACHE.glob("*.onnx")]

    if destination.exists():
        return destination

    # Try to discover downloaded filename and normalize it.
    added = [p for p in after if p not in before]
    candidate = None
    if added:
        candidate = max(added, key=lambda p: p.stat().st_size)
    else:
        # Fallback: find an existing file that contains model name.
        lowered = model_name.lower()
        named = [p for p in after if lowered in p.name.lower()]
        if named:
            candidate = max(named, key=lambda p: p.stat().st_size)

    if candidate is None or not candidate.exists():
        raise SystemExit(f"Could not resolve downloaded model file for '{model_name}'.")

    if candidate.resolve() != destination.resolve():
        shutil.copy2(candidate, destination)
    return destination


def main() -> int:
    BUILD_CACHE.mkdir(parents=True, exist_ok=True)
    TARGET_DIR.mkdir(parents=True, exist_ok=True)

    for model_name, filename in MODEL_MAP.items():
        source = _download_model_if_needed(model_name, filename)
        target = TARGET_DIR / filename
        if target.exists() and target.stat().st_size == source.stat().st_size:
            continue
        shutil.copy2(source, target)

    missing = [name for name in MODEL_MAP.values() if not (TARGET_DIR / name).exists()]
    if missing:
        raise SystemExit(f"Missing prepared rembg model files: {', '.join(missing)}")

    print(f"Prepared rembg models at: {TARGET_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

