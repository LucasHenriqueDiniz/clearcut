import { create } from "zustand";
import type { JobFileResult, JobResponse, ProcessingOptions, ProviderSettingsPayload, ProviderStatus, UploadItem } from "@/types";

type AppState = {
  uploads: UploadItem[];
  currentJob?: JobResponse;
  resultByInput: Record<string, JobFileResult>;
  providerStatus: ProviderStatus[];
  providerSettings?: ProviderSettingsPayload;
  activePreset: string;
  options: ProcessingOptions;
  skipDuplicates: boolean;
  ignoreAlreadyInQueue: boolean;
  setUploads: (uploads: UploadItem[]) => void;
  addUploads: (uploads: UploadItem[]) => void;
  updateUpload: (uploadId: string, update: Partial<UploadItem>) => void;
  removeUpload: (uploadId: string) => void;
  setCurrentJob: (job?: JobResponse) => void;
  mergeJobResults: (job: JobResponse) => void;
  setProviderStatus: (status: ProviderStatus[]) => void;
  setProviderSettings: (settings: ProviderSettingsPayload) => void;
  setActivePreset: (preset: string) => void;
  setOptions: (options: Partial<ProcessingOptions>) => void;
  setSkipDuplicates: (value: boolean) => void;
  setIgnoreAlreadyInQueue: (value: boolean) => void;
  resetQueue: () => void;
};

const baseOptions: ProcessingOptions = {
  workflow_mode: "cutout_only",
  processing_order: "cutout_then_enhance",
  preset: "quick_cutout",
  provider_priority: ["rembg_local"],
  remove_background: true,
  cutout_engine: "rembg",
  cutout_model_id: "u2netp",
  local_model: "u2netp",
  local_quality_preset: "balanced",
  enhance_level: "off",
  enhance_engine: "realesrgan",
  enhance_model: null,
  preprocess_denoise: false,
  preprocess_color_normalization: false,
  preprocess_sharpening: false,
  fallback_to_api: false,
  trim_transparent_bounds: true,
  padding: 0,
  resize_mode: "keep",
  resize_max_width: null,
  resize_max_height: null,
  aspect_ratio: "keep",
  background_mode: "transparent",
  background_color: "#ffffff",
  output_dir_override: null,
  output_format: "png",
  quality: 90,
  strip_metadata: true,
  naming_mode: "pattern",
  filename_pattern: "{original_name}_{preset}_{engine}",
  naming_regex_find: "",
  naming_regex_replace: "",
  ocr_language: "eng",
  ocr_max_length: 48,
  alpha_threshold: 10,
  edge_feather_radius: 1,
  white_halo_cleanup: 35,
  save_alpha_mask: false,
};

export const useAppStore = create<AppState>((set) => ({
  uploads: [],
  currentJob: undefined,
  resultByInput: {},
  providerStatus: [],
  providerSettings: undefined,
  activePreset: "quick_cutout",
  options: baseOptions,
  skipDuplicates: true,
  ignoreAlreadyInQueue: true,
  setUploads: (uploads) => set({ uploads }),
  addUploads: (uploads) =>
    set((state) => {
      const nextResultByInput = { ...state.resultByInput };
      for (const item of uploads) {
        delete nextResultByInput[item.path];
      }
      return { uploads: [...state.uploads, ...uploads], resultByInput: nextResultByInput };
    }),
  updateUpload: (uploadId, update) =>
    set((state) => ({
      uploads: state.uploads.map((item) => (item.upload_id === uploadId ? { ...item, ...update } : item)),
    })),
  removeUpload: (uploadId) =>
    set((state) => {
      const item = state.uploads.find((x) => x.upload_id === uploadId);
      const nextResultByInput = { ...state.resultByInput };
      if (item) {
        delete nextResultByInput[item.path];
      }
      return { uploads: state.uploads.filter((x) => x.upload_id !== uploadId), resultByInput: nextResultByInput };
    }),
  setCurrentJob: (currentJob) => set({ currentJob }),
  mergeJobResults: (job) =>
    set((state) => ({
      resultByInput: {
        ...state.resultByInput,
        ...Object.fromEntries(job.files.map((file) => [file.input_path, file])),
      },
    })),
  setProviderStatus: (providerStatus) => set({ providerStatus }),
  setProviderSettings: (providerSettings) => set({ providerSettings }),
  setActivePreset: (activePreset) => set({ activePreset }),
  setOptions: (partial) => set((state) => ({ options: { ...state.options, ...partial } })),
  setSkipDuplicates: (skipDuplicates) => set({ skipDuplicates }),
  setIgnoreAlreadyInQueue: (ignoreAlreadyInQueue) => set({ ignoreAlreadyInQueue }),
  resetQueue: () => set({ uploads: [], currentJob: undefined, resultByInput: {} }),
}));
