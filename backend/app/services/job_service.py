import json
import logging
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from threading import Lock
from uuid import uuid4

from app.pipelines.engine import processing_engine
from app.schemas.jobs import JobFileResult, JobResponse, ProcessingOptions
from app.storage.filesystem import storage
from app.storage.history import history_store

logger = logging.getLogger(__name__)

@dataclass
class JobStateData:
    job_id: str
    state: str
    progress: float
    created_at: datetime
    updated_at: datetime
    options: ProcessingOptions
    cancel_requested: bool = False
    mask_hints: dict[str, bytes] = field(default_factory=dict)
    files: list[JobFileResult] = field(default_factory=list)


class JobService:
    def __init__(self) -> None:
        self._jobs: dict[str, JobStateData] = {}
        self._lock = Lock()
        self._executor = ThreadPoolExecutor(max_workers=3)

    def create_job(self, paths: list[Path], options: ProcessingOptions, mask_hints: dict[str, bytes] | None = None) -> str:
        job_id = str(uuid4())
        now = datetime.utcnow()
        files = [
            JobFileResult(input_path=str(path.resolve()), state="queued")
            for path in paths
        ]
        state = JobStateData(
            job_id=job_id,
            state="queued",
            progress=0.0,
            created_at=now,
            updated_at=now,
            options=options,
            mask_hints=mask_hints or {},
            files=files,
        )
        with self._lock:
            self._jobs[job_id] = state
        self._executor.submit(self._run_job, job_id)
        return job_id

    def _run_job(self, job_id: str) -> None:
        with self._lock:
            job = self._jobs[job_id]
            job.state = "processing"
            job.updated_at = datetime.utcnow()

        total = len(job.files) or 1
        completed = 0

        first_started: float | None = None
        for sequence_number, file_item in enumerate(job.files, start=1):
            if job.cancel_requested:
                file_item.state = "canceled"
                continue
            file_item.state = "processing"
            file_item.started_at = datetime.utcnow()
            if sequence_number == 1:
                logger.info("First file processing started (job=%s, model=%s)", job_id, job.options.local_model)
                first_started = time.perf_counter()
            try:
                result = processing_engine.process_file(
                    Path(file_item.input_path),
                    job.options,
                    sequence_number=sequence_number,
                    mask_hint_bytes=job.mask_hints.get(file_item.input_path),
                )
                file_item.output_path = result["output_path"]
                file_item.output_filename = result["output_filename"]
                file_item.engine_used = result["engine_used"]
                file_item.provider_used = result["provider_used"]
                file_item.state = "done"
                file_item.finished_at = datetime.utcnow()
                if sequence_number == 1 and first_started is not None:
                    elapsed_ms = int((time.perf_counter() - first_started) * 1000)
                    logger.info("First file processing finished in %sms (job=%s)", elapsed_ms, job_id)
                history_store.add(
                    {
                        "original_filename": Path(file_item.input_path).name,
                        "output_filename": Path(file_item.output_path).name if file_item.output_path else "",
                        "engine_used": file_item.engine_used,
                        "provider_used": file_item.provider_used,
                        "processing_options": json.dumps(job.options.model_dump()),
                        "success": True,
                        "error_message": None,
                        "input_path": file_item.input_path,
                        "output_path": file_item.output_path or "",
                    }
                )
            except Exception as exc:
                file_item.state = "failed"
                file_item.error_message = str(exc)
                file_item.finished_at = datetime.utcnow()
                if sequence_number == 1 and first_started is not None:
                    elapsed_ms = int((time.perf_counter() - first_started) * 1000)
                    logger.info("First file processing failed in %sms (job=%s)", elapsed_ms, job_id)
                history_store.add(
                    {
                        "original_filename": Path(file_item.input_path).name,
                        "output_filename": "",
                        "engine_used": "n/a",
                        "provider_used": "n/a",
                        "processing_options": json.dumps(job.options.model_dump()),
                        "success": False,
                        "error_message": str(exc),
                        "input_path": file_item.input_path,
                        "output_path": "",
                    }
                )
            completed += 1
            with self._lock:
                job.progress = round((completed / total) * 100, 2)
                job.updated_at = datetime.utcnow()

        with self._lock:
            if job.cancel_requested:
                job.state = "canceled"
                job.updated_at = datetime.utcnow()
                return
            has_error = any(item.state == "failed" for item in job.files)
            job.state = "failed" if has_error else "done"
            job.updated_at = datetime.utcnow()

    def get_job(self, job_id: str) -> JobResponse:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                raise KeyError("Job not found")
            return JobResponse(
                job_id=job.job_id,
                state=job.state,
                progress=job.progress,
                created_at=job.created_at,
                updated_at=job.updated_at,
                options=job.options,
                files=job.files,
            )

    def create_zip_for_job(self, job_id: str) -> Path:
        job = self.get_job(job_id)
        zip_path = storage.zip_path_for(f"job_{job_id}")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
            for item in job.files:
                if item.output_path and Path(item.output_path).exists():
                    archive.write(item.output_path, arcname=Path(item.output_path).name)
        return zip_path

    def cancel_job(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return False
            job.cancel_requested = True
            job.updated_at = datetime.utcnow()
            return True


job_service = JobService()
