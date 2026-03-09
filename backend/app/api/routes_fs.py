import os
import platform
import subprocess
from pathlib import Path
from fastapi import APIRouter, HTTPException
from app.core.config import settings

router = APIRouter(prefix="/fs", tags=["filesystem"])


def _map_container_path_to_host(path: Path) -> str:
    resolved = str(path.resolve())
    output_root = str(settings.output_dir.resolve())
    upload_root = str(settings.upload_dir.resolve())
    if resolved.startswith(output_root):
        return resolved.replace(output_root, settings.host_output_dir, 1)
    if resolved.startswith(upload_root):
        return resolved.replace(upload_root, settings.host_upload_dir, 1)
    return resolved


def _reveal(path: Path) -> None:
    system = platform.system().lower()
    if system == "windows":
        subprocess.run(["explorer", "/select,", str(path)], check=False)
    elif system == "darwin":
        subprocess.run(["open", "-R", str(path)], check=False)
    else:
        subprocess.run(["xdg-open", str(path.parent)], check=False)


@router.post("/reveal")
def reveal_file(path: str) -> dict:
    file_path = Path(path).expanduser().resolve()
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    if settings.running_in_docker:
        return {
            "ok": True,
            "opened": False,
            "file_path": str(file_path),
            "host_path_hint": _map_container_path_to_host(file_path),
            "message": "Running in Docker. Reveal this file from the host path.",
        }
    _reveal(file_path)
    return {
        "ok": True,
        "opened": True,
        "file_path": str(file_path),
        "host_path_hint": _map_container_path_to_host(file_path),
        "message": "File revealed.",
    }


@router.post("/open-output")
def open_output_folder() -> dict:
    output_path = settings.output_dir.resolve()
    if not output_path.exists():
        raise HTTPException(status_code=404, detail="Output folder not found")
    if settings.running_in_docker:
        return {
            "ok": True,
            "opened": False,
            "output_path": str(output_path),
            "host_output_hint": settings.host_output_dir,
            "message": "Running in Docker. Open the host-mounted output folder manually.",
        }

    opened = False
    message = "Output folder path returned."
    try:
        system = platform.system().lower()
        if system == "windows":
            os.startfile(str(output_path))  # type: ignore[attr-defined]
            opened = True
            message = "Output folder opened."
        elif system == "darwin":
            subprocess.run(["open", str(output_path)], check=False)
            opened = True
            message = "Output folder opened."
        else:
            subprocess.run(["xdg-open", str(output_path)], check=False)
            opened = True
            message = "Output folder opened."
    except Exception as exc:
        message = str(exc)

    return {
        "ok": True,
        "opened": opened,
        "output_path": str(output_path),
        "host_output_hint": settings.host_output_dir,
        "message": message,
    }
