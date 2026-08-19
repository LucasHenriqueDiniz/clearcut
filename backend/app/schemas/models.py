from datetime import datetime
from typing import Literal

from pydantic import BaseModel


ModelTask = Literal["cutout", "enhance", "tagging", "ocr"]
ModelEngine = Literal["rembg", "realesrgan", "wdtagger", "tesseract"]
ModelInstallState = Literal["not_installed", "downloading", "installed", "failed"]
ModelMigrationMode = Literal["move", "delete", "ignore"]


class ModelCatalogItem(BaseModel):
    id: str
    task: ModelTask
    engine: ModelEngine
    name: str
    description: str
    size_mb: float
    filename: str | None = None
    installable: bool = True
    included_by_default: bool = False
    runtime_ready: bool = False
    status_note: str | None = None
    download_url: str | None = None
    checksum: str | None = None
    installed: bool
    install_state: ModelInstallState
    local_path: str | None = None
    last_error: str | None = None
    last_used_at: datetime | None = None


class ModelStatusResponse(BaseModel):
    id: str
    installed: bool
    install_state: ModelInstallState
    local_path: str | None = None
    last_error: str | None = None
    last_used_at: datetime | None = None


class ModelStorageConfig(BaseModel):
    root_dir: str
    rembg_dir: str
    default_root_dir: str
    using_custom_root: bool


class UpdateModelStorageRequest(BaseModel):
    root_dir: str | None = None
    migration_mode: ModelMigrationMode = "move"


BenchmarkState = Literal["idle", "running", "done", "failed"]


class RunModelBenchmarkRequest(BaseModel):
    task: ModelTask = "cutout"
    sample_dir: str | None = None
    model_ids: list[str] | None = None


class ModelBenchmarkImageResult(BaseModel):
    image_name: str
    input_path: str
    output_path: str | None = None
    elapsed_ms: int | None = None
    alpha_ratio: float | None = None
    bbox_ratio: float | None = None
    alpha_std: float | None = None
    passed: bool = False
    error_message: str | None = None


class ModelBenchmarkResult(BaseModel):
    model_id: str
    model_name: str
    engine: ModelEngine
    quality_preset: str | None = None
    runtime_config: dict[str, bool | int | float | str | None] = {}
    total_images: int
    passed_images: int
    failed_images: int
    average_elapsed_ms: float | None = None
    average_alpha_ratio: float | None = None
    average_bbox_ratio: float | None = None
    average_alpha_std: float | None = None
    score: float
    output_dir: str | None = None
    preview_path: str | None = None
    notes: list[str] = []
    images: list[ModelBenchmarkImageResult] = []


class ModelBenchmarkReport(BaseModel):
    task: ModelTask
    sample_dir: str
    benchmark_dir: str
    log_path: str | None = None
    generated_at: datetime
    total_models: int
    total_images: int
    results: list[ModelBenchmarkResult]


class ModelBenchmarkStatus(BaseModel):
    state: BenchmarkState
    task: ModelTask = "cutout"
    sample_dir: str | None = None
    benchmark_dir: str | None = None
    log_path: str | None = None
    total_models: int = 0
    completed_models: int = 0
    current_model_id: str | None = None
    current_model_name: str | None = None
    current_image_name: str | None = None
    completed_images: int = 0
    total_images: int = 0
    current_model_started_at: datetime | None = None
    last_error: str | None = None
    report: ModelBenchmarkReport | None = None
