from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field, model_validator


JobState = Literal["queued", "processing", "done", "failed", "canceled"]
JobSource = Literal["manual", "watch_folder"]


class UploadItem(BaseModel):
    upload_id: str
    filename: str
    size: int
    mime_type: str
    path: str
    source_path: Optional[str] = None
    storage_mode: Literal["desktop_path", "uploaded_blob"] = "uploaded_blob"


class ProcessingOptions(BaseModel):
    workflow_mode: Literal["cutout_only", "enhance_only", "cutout_enhance"] = "cutout_only"
    processing_order: Optional[Literal["cutout_then_enhance", "enhance_then_cutout"]] = "cutout_then_enhance"
    preset: str = "quick_cutout"
    provider_priority: list[str] = Field(default_factory=lambda: ["rembg_local"])
    remove_background: bool = True
    cutout_engine: Literal["rembg"] = "rembg"
    cutout_model_id: str = "u2netp"
    local_model: Optional[str] = None
    local_quality_preset: Optional[Literal["fast", "balanced", "hq"]] = None
    enhance_level: Literal["off", "2x", "4x"] = "off"
    enhance_engine: Literal["realesrgan"] = "realesrgan"
    enhance_model: Optional[str] = None
    preprocess_denoise: bool = False
    preprocess_color_normalization: bool = False
    preprocess_sharpening: bool = False
    fallback_to_api: bool = False
    trim_transparent_bounds: bool = True
    padding: int = 0
    resize_mode: Literal["keep", "custom"] = "keep"
    resize_max_width: Optional[int] = None
    resize_max_height: Optional[int] = None
    aspect_ratio: str = "keep"
    background_mode: Literal["transparent", "solid"] = "transparent"
    background_color: str = "#FFFFFF"
    output_dir_override: str | None = None
    output_format: Literal["png", "webp", "jpeg", "jpg", "avif"] = "png"
    quality: int = 90
    strip_metadata: bool = True
    naming_mode: Literal["keep_original", "pattern", "ocr_text"] = "pattern"
    filename_pattern: str = "{original_name}_{preset}_{engine}"
    naming_regex_find: Optional[str] = None
    naming_regex_replace: str = ""
    ocr_language: str = "eng"
    ocr_max_length: int = 48
    alpha_threshold: int = 10
    edge_feather_radius: int = 1
    white_halo_cleanup: int = 35
    save_alpha_mask: bool = False

    @model_validator(mode="after")
    def _sync_legacy_model_fields(self) -> "ProcessingOptions":
        if not self.cutout_model_id and self.local_model:
            self.cutout_model_id = self.local_model
        if not self.local_model:
            self.local_model = self.cutout_model_id
        return self


class CreateJobRequest(BaseModel):
    upload_ids: list[str] = Field(default_factory=list)
    mask_hints: dict[str, str] = Field(default_factory=dict)
    options: ProcessingOptions


class CreateBatchJobRequest(BaseModel):
    items: list[str] = Field(default_factory=list, description="Absolute or relative local file paths")
    options: ProcessingOptions


class IngestPathsRequest(BaseModel):
    paths: list[str] = Field(default_factory=list, description="Absolute local file paths")


class JobFileResult(BaseModel):
    input_path: str
    output_path: Optional[str] = None
    output_filename: Optional[str] = None
    state: JobState
    engine_used: Optional[str] = None
    provider_used: Optional[str] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class JobResponse(BaseModel):
    job_id: str
    state: JobState
    progress: float
    created_at: datetime
    updated_at: datetime
    options: ProcessingOptions
    files: list[JobFileResult] = Field(default_factory=list)


class JobExecutionConfig(BaseModel):
    output_dir_override: str | None = None
    source: JobSource = "manual"
    watch_folder_id: str | None = None
    # Files processed at once within a single job. None lets the server pick
    # (see job_service.resolve_file_concurrency); 1 restores serial execution.
    max_parallel_files: int | None = Field(default=None, ge=1, le=16)


class ProcessSingleRequest(BaseModel):
    image_path: str
    options: ProcessingOptions


class HistoryItem(BaseModel):
    id: int
    original_filename: str
    output_filename: str
    engine_used: str
    provider_used: str
    processing_options: str
    created_at: datetime
    success: bool
    error_message: Optional[str]
    input_path: str
    output_path: str
