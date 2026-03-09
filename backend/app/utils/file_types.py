from pathlib import Path

SUPPORTED_INPUT = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff", ".heic", ".heif", ".avif"}
SUPPORTED_OUTPUT = {"png", "webp", "jpeg", "jpg", "avif"}


def is_supported_input(path: Path) -> bool:
    return path.suffix.lower() in SUPPORTED_INPUT
