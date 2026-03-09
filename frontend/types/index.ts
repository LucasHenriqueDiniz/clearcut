export type ProviderStatus = {
  name: string;
  enabled: boolean;
  available: boolean;
  is_local: boolean;
  priority: number;
  key_count: number;
  healthy: boolean;
  last_error?: string | null;
};

export type ProviderApiKey = {
  id: string;
  label: string;
  key: string;
  enabled: boolean;
  priority: number;
  usage_notes?: string | null;
  monthly_limit?: number | null;
  daily_limit?: number | null;
  used_count: number;
  last_success_at?: string | null;
  last_error?: string | null;
  cooldown_until?: string | null;
};

export type ProviderSettingsItem = {
  name: string;
  enabled: boolean;
  priority: number;
  keys: ProviderApiKey[];
};

export type ProviderSettingsPayload = {
  use_only_local: boolean;
  providers: ProviderSettingsItem[];
};

export type UploadItem = {
  upload_id: string;
  filename: string;
  size: number;
  mime_type: string;
  path: string;
  source_path?: string;
  storage_mode: "desktop_path" | "uploaded_blob";
  preview_url?: string;
  fingerprint?: string;
  mask_hint_data_url?: string;
};

export type ProcessingOptions = {
  preset: string;
  provider_priority: string[];
  remove_background: boolean;
  local_model: string;
  fallback_to_api: boolean;
  trim_transparent_bounds: boolean;
  padding: number;
  resize_mode: "keep" | "custom";
  resize_max_width?: number | null;
  resize_max_height?: number | null;
  aspect_ratio: string;
  background_mode: "transparent" | "solid";
  background_color: string;
  output_format: "png" | "webp" | "jpeg" | "jpg" | "avif";
  quality: number;
  strip_metadata: boolean;
  naming_mode: "keep_original" | "pattern" | "ocr_text";
  filename_pattern: string;
  naming_regex_find?: string | null;
  naming_regex_replace: string;
  ocr_language: string;
  ocr_max_length: number;
  alpha_threshold: number;
  edge_feather_radius: number;
  white_halo_cleanup: number;
  save_alpha_mask: boolean;
};

export type JobFileResult = {
  input_path: string;
  output_path?: string | null;
  output_filename?: string | null;
  state: "queued" | "processing" | "done" | "failed" | "canceled";
  engine_used?: string | null;
  provider_used?: string | null;
  error_message?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
};

export type JobResponse = {
  job_id: string;
  state: "queued" | "processing" | "done" | "failed" | "canceled";
  progress: number;
  created_at: string;
  updated_at: string;
  options: ProcessingOptions;
  files: JobFileResult[];
};

export type HistoryItem = {
  id: number;
  original_filename: string;
  output_filename: string;
  engine_used: string;
  provider_used: string;
  processing_options: string;
  created_at: string;
  success: boolean;
  error_message?: string | null;
  input_path: string;
  output_path: string;
};
