from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field


JobState = Literal["queued", "processing", "done", "failed", "canceled"]


class UploadItem(BaseModel):
    upload_id: str
    filename: str
    size: int
    mime_type: str
    path: str
    source_path: Optional[str] = None
    storage_mode: Literal["desktop_path", "uploaded_blob"] = "uploaded_blob"


class ProcessingOptions(BaseModel):
    preset: str = "quick_cutout"
    provider_priority: list[str] = Field(default_factory=lambda: ["simple_cv_local", "rembg_local", "remove_bg_api"])
    remove_background: bool = True
    local_model: str = "u2net"
    fallback_to_api: bool = True
    trim_transparent_bounds: bool = True
    padding: int = 0
    resize_mode: Literal["keep", "custom"] = "keep"
    resize_max_width: Optional[int] = None
    resize_max_height: Optional[int] = None
    aspect_ratio: str = "keep"
    background_mode: Literal["transparent", "solid"] = "transparent"
    background_color: str = "#FFFFFF"
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
