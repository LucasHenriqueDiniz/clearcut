from __future__ import annotations

import io
import gc
import json
import traceback
import threading
import time
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image

from app.core.config import settings
from app.providers.local_rembg import (
    RembgLocalProvider,
    clear_rembg_session_cache,
    resolve_runtime_config,
)
from app.schemas.models import (
    ModelBenchmarkImageResult,
    ModelBenchmarkReport,
    ModelBenchmarkResult,
    ModelBenchmarkStatus,
    RunModelBenchmarkRequest,
)
from app.services.model_catalog import model_catalog_service
from app.utils.file_types import is_supported_input


class ModelBenchmarkService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._status = ModelBenchmarkStatus(state="idle")
        self._worker: threading.Thread | None = None
        self._provider = RembgLocalProvider()

    def default_sample_dir(self) -> Path:
        repo_root = Path(__file__).resolve().parents[3]
        candidate = repo_root / "sample-images"
        return candidate.resolve()

    def benchmark_root_dir(self) -> Path:
        root = Path(model_catalog_service.models_dir()).parent / "benchmarks"
        root.mkdir(parents=True, exist_ok=True)
        return root

    def benchmark_log_root_dir(self) -> Path:
        root = Path(settings.logs_dir).expanduser().resolve() / "benchmarks"
        root.mkdir(parents=True, exist_ok=True)
        return root

    def _append_log(self, log_path: Path, event: str, **payload: object) -> None:
        entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "event": event,
            **payload,
        }
        with log_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, ensure_ascii=True) + "\n")

    def status(self) -> ModelBenchmarkStatus:
        with self._lock:
            return self._status.model_copy(deep=True)

    def run(self, payload: RunModelBenchmarkRequest) -> ModelBenchmarkStatus:
        with self._lock:
            if self._status.state == "running":
                return self._status.model_copy(deep=True)

            sample_dir = self._resolve_sample_dir(payload.sample_dir)
            model_ids = self._resolve_models(payload.task, payload.model_ids)
            benchmark_dir = self.benchmark_root_dir() / datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            benchmark_dir.mkdir(parents=True, exist_ok=True)
            log_path = self.benchmark_log_root_dir() / f"{benchmark_dir.name}.jsonl"

            self._status = ModelBenchmarkStatus(
                state="running",
                task=payload.task,
                sample_dir=str(sample_dir),
                benchmark_dir=str(benchmark_dir),
                log_path=str(log_path),
                total_models=len(model_ids),
                completed_models=0,
                current_model_id=None,
                current_model_name=None,
                current_image_name=None,
                completed_images=0,
                total_images=0,
                current_model_started_at=None,
                last_error=None,
                report=None,
            )
            self._worker = threading.Thread(
                target=self._run_worker,
                args=(payload.task, sample_dir, benchmark_dir, log_path, model_ids),
                daemon=True,
            )
            self._worker.start()
            return self._status.model_copy(deep=True)

    def _resolve_sample_dir(self, sample_dir: str | None) -> Path:
        target = Path(sample_dir).expanduser().resolve() if sample_dir else self.default_sample_dir()
        if not target.exists() or not target.is_dir():
            raise RuntimeError(f"Sample folder not found: {target}")
        image_files = [p for p in sorted(target.iterdir()) if p.is_file() and is_supported_input(p)]
        if not image_files:
            raise RuntimeError(f"No supported images found in sample folder: {target}")
        return target

    def _resolve_models(self, task: str, model_ids: list[str] | None) -> list[str]:
        if task != "cutout":
            raise RuntimeError("Benchmarking is currently available only for cutout models")
        installed_cutout = [item.id for item in model_catalog_service.list_catalog(task="cutout") if item.installed]
        if model_ids:
            chosen = [model_id for model_id in model_ids if model_id in installed_cutout]
        else:
            chosen = installed_cutout
        if not chosen:
            raise RuntimeError("No installed cutout models available for benchmark")
        return chosen

    def _run_worker(self, task: str, sample_dir: Path, benchmark_dir: Path, log_path: Path, model_ids: list[str]) -> None:
        try:
            image_paths = [p for p in sorted(sample_dir.iterdir()) if p.is_file() and is_supported_input(p)]
            self._append_log(
                log_path,
                "benchmark_started",
                task=task,
                sample_dir=str(sample_dir),
                benchmark_dir=str(benchmark_dir),
                model_ids=model_ids,
                total_images=len(image_paths),
            )
            results: list[ModelBenchmarkResult] = []
            for index, model_id in enumerate(model_ids, start=1):
                clear_rembg_session_cache()
                gc.collect()
                meta = model_catalog_service.get_meta(model_id)
                self._append_log(
                    log_path,
                    "model_started",
                    model_id=model_id,
                    model_name=str(meta["name"]),
                    quality_preset=self._quality_for_model(model_id),
                    runtime_config=self._runtime_config_for_model(model_id),
                    model_index=index,
                    total_models=len(model_ids),
                )
                with self._lock:
                    self._status.current_model_id = model_id
                    self._status.current_model_name = str(meta["name"])
                    self._status.current_image_name = None
                    self._status.completed_images = 0
                    self._status.total_images = len(image_paths)
                    self._status.current_model_started_at = datetime.utcnow()

                result = self._benchmark_model(model_id, meta, image_paths, benchmark_dir / model_id, log_path)
                results.append(result)
                clear_rembg_session_cache()
                gc.collect()
                self._append_log(
                    log_path,
                    "model_finished",
                    model_id=model_id,
                    model_name=str(meta["name"]),
                    passed_images=result.passed_images,
                    failed_images=result.failed_images,
                    score=result.score,
                    average_elapsed_ms=result.average_elapsed_ms,
                )

                with self._lock:
                    self._status.completed_models = index

            results.sort(key=lambda item: (-item.score, item.average_elapsed_ms or 10_000_000))
            report = ModelBenchmarkReport(
                task=task,
                sample_dir=str(sample_dir),
                benchmark_dir=str(benchmark_dir),
                log_path=str(log_path),
                generated_at=datetime.utcnow(),
                total_models=len(model_ids),
                total_images=len(image_paths),
                results=results,
            )
            report_path = benchmark_dir / "report.json"
            report_path.write_text(report.model_dump_json(indent=2), encoding="utf-8")

            with self._lock:
                self._status.state = "done"
                self._status.current_model_id = None
                self._status.current_model_name = None
                self._status.current_image_name = None
                self._status.current_model_started_at = None
                self._status.last_error = None
                self._status.log_path = str(log_path)
                self._status.report = report
            self._append_log(
                log_path,
                "benchmark_finished",
                total_models=len(model_ids),
                total_images=len(image_paths),
                ranked_model_ids=[item.model_id for item in results],
            )
        except Exception as exc:
            self._append_log(
                log_path,
                "benchmark_failed",
                error=str(exc),
                traceback=traceback.format_exc(),
            )
            with self._lock:
                self._status.state = "failed"
                self._status.current_model_id = None
                self._status.current_model_name = None
                self._status.current_image_name = None
                self._status.current_model_started_at = None
                self._status.last_error = str(exc)
                self._status.log_path = str(log_path)

    def _benchmark_model(self, model_id: str, meta: dict, image_paths: list[Path], output_dir: Path, log_path: Path) -> ModelBenchmarkResult:
        output_dir.mkdir(parents=True, exist_ok=True)
        image_results: list[ModelBenchmarkImageResult] = []
        quality_preset = self._quality_for_model(model_id)
        runtime_config = self._runtime_config_for_model(model_id)

        for index, image_path in enumerate(image_paths, start=1):
            with self._lock:
                self._status.current_image_name = image_path.name
            clear_rembg_session_cache()
            gc.collect()
            input_bytes = image_path.read_bytes()
            started = time.perf_counter()
            self._append_log(
                log_path,
                "image_started",
                model_id=model_id,
                model_name=str(meta["name"]),
                image_name=image_path.name,
                image_index=index,
                total_images=len(image_paths),
                input_path=str(image_path),
                input_size_bytes=len(input_bytes),
                quality_preset=quality_preset,
                runtime_config=runtime_config,
            )
            try:
                result = self._provider.remove_background(
                    input_bytes,
                    model=model_id,
                    quality_preset=quality_preset,
                )
                elapsed_ms = int((time.perf_counter() - started) * 1000)
                output_path = output_dir / f"{image_path.stem}.png"
                output_path.write_bytes(result.content)
                metrics = self._analyze_output(result.content)
                image_results.append(
                    ModelBenchmarkImageResult(
                        image_name=image_path.name,
                        input_path=str(image_path),
                        output_path=str(output_path),
                        elapsed_ms=elapsed_ms,
                        alpha_ratio=metrics["alpha_ratio"],
                        bbox_ratio=metrics["bbox_ratio"],
                        alpha_std=metrics["alpha_std"],
                        passed=metrics["passed"],
                        error_message=None,
                    )
                )
                self._append_log(
                    log_path,
                    "image_finished",
                    model_id=model_id,
                    model_name=str(meta["name"]),
                    image_name=image_path.name,
                    output_path=str(output_path),
                    elapsed_ms=elapsed_ms,
                    passed=bool(metrics["passed"]),
                    alpha_ratio=metrics["alpha_ratio"],
                    bbox_ratio=metrics["bbox_ratio"],
                    alpha_std=metrics["alpha_std"],
                    border_clear_ratio=metrics["border_clear_ratio"],
                )
            except Exception as exc:
                image_results.append(
                    ModelBenchmarkImageResult(
                        image_name=image_path.name,
                        input_path=str(image_path),
                        output_path=None,
                        elapsed_ms=None,
                        alpha_ratio=None,
                        bbox_ratio=None,
                        alpha_std=None,
                        passed=False,
                        error_message=str(exc),
                    )
                )
                self._append_log(
                    log_path,
                    "image_failed",
                    model_id=model_id,
                    model_name=str(meta["name"]),
                    image_name=image_path.name,
                    error=str(exc),
                    traceback=traceback.format_exc(),
                )
            finally:
                clear_rembg_session_cache()
                gc.collect()
                with self._lock:
                    self._status.completed_images = index

        return self._summarize_model(meta, model_id, image_results, output_dir)

    def _analyze_output(self, content: bytes) -> dict[str, float | bool]:
        image = Image.open(io.BytesIO(content)).convert("RGBA")
        alpha = np.array(image.getchannel("A"), dtype=np.uint8)
        total = max(1, alpha.size)
        non_transparent = int(np.count_nonzero(alpha > 5))
        alpha_ratio = non_transparent / total
        bbox = image.getchannel("A").getbbox()
        bbox_ratio = 0.0
        if bbox:
            left, top, right, bottom = bbox
            bbox_ratio = ((right - left) * (bottom - top)) / total
        alpha_float = alpha.astype(np.float32) / np.float32(255.0)
        alpha_std = float(np.std(alpha_float))
        border_size = max(12, int(min(image.width, image.height) * 0.06))
        border_mask = np.ones(alpha.shape, dtype=bool)
        if image.width > border_size * 2 and image.height > border_size * 2:
            border_mask[border_size:-border_size, border_size:-border_size] = False
        border_pixels = alpha[border_mask]
        border_clear_ratio = float(np.count_nonzero(border_pixels <= 5)) / max(1, border_pixels.size)
        passed = bool(
            bbox
            and 0.01 <= alpha_ratio <= 0.92
            and bbox_ratio <= 0.96
            and alpha_std >= 0.02
            and border_clear_ratio >= 0.08
        )
        return {
            "alpha_ratio": round(alpha_ratio, 4),
            "bbox_ratio": round(bbox_ratio, 4),
            "alpha_std": round(alpha_std, 4),
            "border_clear_ratio": round(border_clear_ratio, 4),
            "passed": passed,
        }

    def _summarize_model(
        self,
        meta: dict,
        model_id: str,
        image_results: list[ModelBenchmarkImageResult],
        output_dir: Path,
    ) -> ModelBenchmarkResult:
        passed = [item for item in image_results if item.passed]
        failed = [item for item in image_results if not item.passed]
        elapsed_values = [item.elapsed_ms for item in image_results if item.elapsed_ms is not None]
        alpha_ratios = [item.alpha_ratio for item in image_results if item.alpha_ratio is not None]
        bbox_ratios = [item.bbox_ratio for item in image_results if item.bbox_ratio is not None]
        alpha_std_values = [item.alpha_std for item in image_results if item.alpha_std is not None]

        notes: list[str] = []
        if failed:
            failed_names = ", ".join(item.image_name for item in failed[:3])
            notes.append(f"Failed or suspicious on: {failed_names}")
        if elapsed_values and np.mean(elapsed_values) > 5000:
            notes.append("Slow average runtime on the current machine")
        if alpha_ratios and np.mean(alpha_ratios) > 0.8:
            notes.append("Masks tend to keep a very large portion of the image")
        if alpha_ratios and np.mean(alpha_ratios) < 0.03:
            notes.append("Masks tend to be extremely sparse")

        avg_elapsed = round(float(np.mean(elapsed_values)), 1) if elapsed_values else None
        avg_alpha = round(float(np.mean(alpha_ratios)), 4) if alpha_ratios else None
        avg_bbox = round(float(np.mean(bbox_ratios)), 4) if bbox_ratios else None
        avg_alpha_std = round(float(np.mean(alpha_std_values)), 4) if alpha_std_values else None
        preview = next((item.output_path for item in image_results if item.output_path), None)

        pass_ratio = len(passed) / max(1, len(image_results))
        speed_score = 0.0 if avg_elapsed is None else max(0.0, 12.0 - min(avg_elapsed / 450.0, 12.0))
        detail_score = 0.0 if avg_alpha_std is None else min(avg_alpha_std * 18.0, 10.0)
        bbox_penalty = 0.0 if avg_bbox is None else max(0.0, (avg_bbox - 0.88) * 45.0)
        alpha_penalty = 0.0
        if avg_alpha is not None:
            if avg_alpha > 0.78:
                alpha_penalty += min(12.0, (avg_alpha - 0.78) * 40.0)
            if avg_alpha < 0.04:
                alpha_penalty += min(12.0, (0.04 - avg_alpha) * 220.0)
        score = round(
            max(
                0.0,
                min(
                    100.0,
                    (pass_ratio * 72.0) + speed_score + detail_score - bbox_penalty - alpha_penalty,
                ),
            ),
            2,
        )

        return ModelBenchmarkResult(
            model_id=model_id,
            model_name=str(meta["name"]),
            engine=meta["engine"],
            quality_preset=self._quality_for_model(model_id),
            runtime_config=self._runtime_config_for_model(model_id),
            total_images=len(image_results),
            passed_images=len(passed),
            failed_images=len(failed),
            average_elapsed_ms=avg_elapsed,
            average_alpha_ratio=avg_alpha,
            average_bbox_ratio=avg_bbox,
            average_alpha_std=avg_alpha_std,
            score=score,
            output_dir=str(output_dir),
            preview_path=preview,
            notes=notes,
            images=image_results,
        )

    def _quality_for_model(self, model_id: str) -> str:
        if model_id in {"u2netp", "silueta"}:
            return "fast"
        if model_id in {"birefnet-general", "birefnet-portrait"}:
            return "hq"
        return "balanced"

    def _runtime_config_for_model(self, model_id: str) -> dict[str, bool | int | float | str | None]:
        quality_preset, _, config = resolve_runtime_config(
            model=model_id,
            quality_preset=self._quality_for_model(model_id),
        )
        return {
            "quality_preset": quality_preset,
            "model_name": model_id,
            **config,
        }


model_benchmark_service = ModelBenchmarkService()
