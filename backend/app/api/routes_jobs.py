from pathlib import Path
import io
import base64
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError

from app.schemas.jobs import (
    CreateBatchJobRequest,
    IngestPathsRequest,
    CreateJobRequest,
    JobResponse,
    ProcessSingleRequest,
    UploadItem,
)
from app.services.job_service import job_service
from app.storage.filesystem import storage
from app.utils.file_types import is_supported_input

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _upload_item_from_entry(entry) -> UploadItem:
    return UploadItem(
        upload_id=entry.upload_id,
        filename=entry.filename,
        size=entry.size,
        mime_type=entry.mime_type,
        path=entry.path,
        source_path=entry.source_path,
        storage_mode=entry.storage_mode,
    )


@router.post("/upload", response_model=list[UploadItem])
async def upload_files(files: list[UploadFile] = File(...)) -> list[UploadItem]:
    items: list[UploadItem] = []
    for file in files:
        if not file.filename:
            continue
        suffix = Path(file.filename).suffix.lower()
        if suffix not in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff", ".heic", ".heif", ".avif"}:
            continue
        payload = await file.read()
        await file.seek(0)
        try:
            with Image.open(io.BytesIO(payload)) as img:
                img.verify()
        except UnidentifiedImageError:
            continue
        except Exception:
            continue
        entry = storage.save_upload(file)
        items.append(_upload_item_from_entry(entry))
    if not items:
        raise HTTPException(status_code=400, detail="No valid image files found in upload request")
    return items


@router.post("/ingest-paths", response_model=list[UploadItem])
def ingest_local_paths(payload: IngestPathsRequest) -> list[UploadItem]:
    if not payload.paths:
        raise HTTPException(status_code=400, detail="No paths provided")

    items: list[UploadItem] = []
    seen: set[str] = set()

    for raw_path in payload.paths:
        source = Path(raw_path).expanduser().resolve()
        source_key = str(source)
        if source_key in seen:
            continue
        seen.add(source_key)

        if not source.exists() or not source.is_file():
            continue

        if not is_supported_input(source):
            continue

        entry = storage.register_local_path(source)
        items.append(_upload_item_from_entry(entry))

    if not items:
        raise HTTPException(status_code=400, detail="No valid image files found in provided paths")

    return items


@router.post("", response_model=dict)
def create_job(payload: CreateJobRequest) -> dict:
    paths: list[Path] = []
    mask_hints: dict[str, bytes] = {}
    for upload_id in payload.upload_ids:
        entry = storage.get_entry(upload_id)
        if not entry:
            raise HTTPException(status_code=404, detail=f"Upload not found: {upload_id}")
        path = Path(entry.path).expanduser().resolve()
        paths.append(path)
        if upload_id in payload.mask_hints:
            raw_value = payload.mask_hints[upload_id]
            try:
                encoded = raw_value.split(",", 1)[1] if "," in raw_value else raw_value
                mask_hints[str(path.resolve())] = base64.b64decode(encoded)
            except Exception as exc:
                raise HTTPException(status_code=400, detail=f"Invalid mask hint for upload: {upload_id}") from exc

    if not paths:
        raise HTTPException(status_code=400, detail="No upload items")

    job_id = job_service.create_job(paths, payload.options, mask_hints=mask_hints)
    return {"job_id": job_id}


@router.post("/batch", response_model=dict)
def create_batch_job(payload: CreateBatchJobRequest) -> dict:
    paths: list[Path] = []
    for item in payload.items:
        path = Path(item).expanduser().resolve()
        if path.is_file() and is_supported_input(path):
            paths.append(path)
        elif path.is_dir():
            paths.extend([p for p in path.rglob("*") if p.is_file() and is_supported_input(p)])
    if not paths:
        raise HTTPException(status_code=400, detail="No supported input files found")

    job_id = job_service.create_job(paths, payload.options)
    return {"job_id": job_id, "count": len(paths)}


@router.post("/single", response_model=dict)
def process_single(payload: ProcessSingleRequest) -> dict:
    path = Path(payload.image_path).expanduser().resolve()
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Image not found")
    job_id = job_service.create_job([path], payload.options)
    return {"job_id": job_id}


@router.get("/{job_id}/zip")
def download_job_zip(job_id: str) -> FileResponse:
    zip_path = job_service.create_zip_for_job(job_id)
    return FileResponse(zip_path, media_type="application/zip", filename=zip_path.name)


@router.get("/download")
def download_output(path: str) -> FileResponse:
    file_path = Path(path).expanduser().resolve()
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path, filename=file_path.name)


@router.get("/{job_id}", response_model=JobResponse)
def get_job_status(job_id: str) -> JobResponse:
    try:
        return job_service.get_job(job_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Job not found")


@router.post("/{job_id}/cancel")
def cancel_job(job_id: str) -> dict:
    ok = job_service.cancel_job(job_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"canceled": True}
