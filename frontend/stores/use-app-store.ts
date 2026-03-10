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
  resetQueue: () => void;
};

const baseOptions: ProcessingOptions = {
  preset: "quick_cutout",
  provider_priority: ["simple_cv_local", "rembg_local", "remove_bg_api"],
  remove_background: true,
  local_model: "u2net",
  fallback_to_api: true,
  trim_transparent_bounds: true,
  padding: 0,
  resize_mode: "keep",
  resize_max_width: null,
  resize_max_height: null,
  aspect_ratio: "keep",
  background_mode: "transparent",
  background_color: "#ffffff",
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
  resetQueue: () => set({ uploads: [], currentJob: undefined, resultByInput: {} }),
}));

export const presets: Record<string, Partial<ProcessingOptions>> = {
  quick_cutout: {
    preset: "quick_cutout",
    remove_background: true,
    trim_transparent_bounds: true,
    output_format: "png",
    quality: 95,
  },
  product_image: {
    preset: "product_image",
    remove_background: true,
    trim_transparent_bounds: true,
    padding: 24,
    output_format: "webp",
    quality: 90,
  },
  portrait: {
    preset: "portrait",
    remove_background: true,
    local_model: "birefnet-portrait",
    output_format: "png",
    quality: 100,
  },
  anime_art: {
    preset: "anime_art",
    remove_background: true,
    local_model: "isnet-general-use",
    output_format: "png",
    quality: 100,
  },
  convert_only: {
    preset: "convert_only",
    remove_background: false,
    trim_transparent_bounds: false,
    output_format: "png",
    quality: 92,
  },
  remove_trim_webp: {
    preset: "remove_trim_webp",
    remove_background: true,
    trim_transparent_bounds: true,
    output_format: "webp",
    quality: 86,
  },
};
