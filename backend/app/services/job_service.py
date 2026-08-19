import json
import logging
import os
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from threading import BoundedSemaphore, Lock
from uuid import uuid4

from app.pipelines.engine import processing_engine
from app.schemas.jobs import JobExecutionConfig, JobFileResult, JobResponse, ProcessingOptions
from app.storage.filesystem import storage
from app.storage.history import history_store

logger = logging.getLogger(__name__)

TERMINAL_STATES = {"done", "failed", "canceled"}
# Finished jobs stay queryable for a while so the UI can still read results,
# then go away: the process is long-lived and each job holds file results.
JOB_RETENTION = timedelta(hours=1)
MAX_RETAINED_JOBS = 100

# Files processed at once inside one job. Cutout is CPU-bound and ONNX Runtime
# already spreads a single inference across cores, so the gain here comes from
# overlapping decode/encode/disk with inference rather than from more compute.
# Measured on a 6-core CPU: ~1.5x at 2 workers, ~1.8x at 4, flat after that.
DEFAULT_FILE_CONCURRENCY = 4
MAX_FILE_CONCURRENCY = 8

# Jobs also run concurrently (see JobService._executor), so cap total in-flight
# files process-wide: without this, N jobs x M workers all fight for the CPU.
_FILE_SLOTS = BoundedSemaphore(MAX_FILE_CONCURRENCY)


def resolve_file_concurrency(execution_config: JobExecutionConfig, file_count: int) -> int:
    """How many files of one job to process at once."""
    if execution_config.max_parallel_files:
        requested = execution_config.max_parallel_files
    else:
        # Leave a core for the UI and the rest of the process.
        cores = os.cpu_count() or 4
        requested = min(DEFAULT_FILE_CONCURRENCY, max(1, cores - 1))
    return max(1, min(requested, MAX_FILE_CONCURRENCY, file_count or 1))

@dataclass
class JobStateData:
    job_id: str
    state: str
    progress: float
    created_at: datetime
    updated_at: datetime
    options: ProcessingOptions
    execution_config: JobExecutionConfig = field(default_factory=JobExecutionConfig)
    cancel_requested: bool = False
    mask_hints: dict[str, bytes] = field(default_factory=dict)
    files: list[JobFileResult] = field(default_factory=list)


class JobService:
    def __init__(self) -> None:
        self._jobs: dict[str, JobStateData] = {}
        self._lock = Lock()
        self._executor = ThreadPoolExecutor(max_workers=3)
        self._completion_listeners: list = []

    def register_completion_listener(self, callback) -> None:
        self._completion_listeners.append(callback)

    def has_file_in_flight(self, path: Path) -> bool:
        needle = str(path.expanduser().resolve())
        with self._lock:
            for job in self._jobs.values():
                if job.state in TERMINAL_STATES:
                    continue
                if any(file.input_path == needle for file in job.files):
                    return True
        return False

    def _prune_finished_locked(self) -> None:
        """Drop finished jobs that are old or in excess. Caller holds the lock."""
        now = datetime.utcnow()
        finished = [
            (job_id, job) for job_id, job in self._jobs.items() if job.state in TERMINAL_STATES
        ]
        expired = [job_id for job_id, job in finished if now - job.updated_at > JOB_RETENTION]
        for job_id in expired:
            del self._jobs[job_id]

        remaining = sorted(
            ((job_id, job) for job_id, job in self._jobs.items() if job.state in TERMINAL_STATES),
            key=lambda item: item[1].updated_at,
        )
        excess = len(remaining) - MAX_RETAINED_JOBS
        for job_id, _ in remaining[:excess] if excess > 0 else []:
            del self._jobs[job_id]

        if expired or excess > 0:
            logger.debug(
                "Pruned finished jobs (expired=%s, excess=%s, retained=%s)",
                len(expired), max(0, excess), len(self._jobs),
            )

    def create_job(
        self,
        paths: list[Path],
        options: ProcessingOptions,
        mask_hints: dict[str, bytes] | None = None,
        execution_config: JobExecutionConfig | None = None,
    ) -> str:
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
            execution_config=execution_config or JobExecutionConfig(),
            mask_hints=mask_hints or {},
            files=files,
        )
        with self._lock:
            self._jobs[job_id] = state
            self._prune_finished_locked()
        self._executor.submit(self._run_job, job_id)
        return job_id

    def _process_file(
        self,
        job: JobStateData,
        job_id: str,
        file_item: JobFileResult,
        sequence_number: int,
    ) -> None:
        """Run one file end to end and record its outcome on `file_item`.

        Runs on a worker thread: everything it touches is either local, owned
        by this one file, or a store that serializes its own writes.
        """
        if job.cancel_requested:
            file_item.state = "canceled"
            return

        with _FILE_SLOTS:
            if job.cancel_requested:
                file_item.state = "canceled"
                return
            file_item.state = "processing"
            file_item.started_at = datetime.utcnow()
            started = time.perf_counter()
            if sequence_number == 1:
                logger.info(
                    "First file processing started (job=%s, model=%s)",
                    job_id, job.options.cutout_model_id,
                )
            try:
                result = processing_engine.process_file(
                    Path(file_item.input_path),
                    job.options,
                    execution_config=job.execution_config,
                    sequence_number=sequence_number,
                    mask_hint_bytes=job.mask_hints.get(file_item.input_path),
                )
                file_item.output_path = result["output_path"]
                file_item.output_filename = result["output_filename"]
                file_item.engine_used = result["engine_used"]
                file_item.provider_used = result["provider_used"]
                file_item.state = "done"
                file_item.finished_at = datetime.utcnow()
                if sequence_number == 1:
                    logger.info(
                        "First file processing finished in %sms (job=%s)",
                        int((time.perf_counter() - started) * 1000), job_id,
                    )
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
                if sequence_number == 1:
                    logger.info(
                        "First file processing failed in %sms (job=%s)",
                        int((time.perf_counter() - started) * 1000), job_id,
                    )
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

        # Mask hints hold raw PNG bytes per file; release as we go.
        job.mask_hints.pop(file_item.input_path, None)
        for callback in self._completion_listeners:
            try:
                callback(job, file_item)
            except Exception:  # pragma: no cover
                logger.exception("Job completion listener failed")

    def _run_job(self, job_id: str) -> None:
        with self._lock:
            job = self._jobs[job_id]
            job.state = "processing"
            job.updated_at = datetime.utcnow()

        total = len(job.files) or 1
        completed = 0
        workers = resolve_file_concurrency(job.execution_config, len(job.files))
        logger.info("Job %s processing %s file(s) with %s worker(s)", job_id, len(job.files), workers)

        if workers == 1:
            for sequence_number, file_item in enumerate(job.files, start=1):
                self._process_file(job, job_id, file_item, sequence_number)
                completed += 1
                with self._lock:
                    job.progress = round((completed / total) * 100, 2)
                    job.updated_at = datetime.utcnow()
        else:
            with ThreadPoolExecutor(max_workers=workers, thread_name_prefix=f"job-{job_id[:8]}") as pool:
                futures = [
                    pool.submit(self._process_file, job, job_id, file_item, sequence_number)
                    for sequence_number, file_item in enumerate(job.files, start=1)
                ]
                for future in as_completed(futures):
                    # _process_file records failures on the file itself, so a
                    # raised exception here means a bug, not a bad image.
                    future.result()
                    completed += 1
                    with self._lock:
                        job.progress = round((completed / total) * 100, 2)
                        job.updated_at = datetime.utcnow()

        job.mask_hints.clear()
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
