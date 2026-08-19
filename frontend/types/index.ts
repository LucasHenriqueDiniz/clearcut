/**
 * Public type surface for the app.
 *
 * Everything the backend owns is aliased from `./api`, which is generated from
 * the FastAPI OpenAPI document (`npm run gen:api`). Hand-writing these meant
 * the frontend could silently disagree with the Pydantic schemas; aliasing
 * turns any backend change into a compile error here instead.
 *
 * Only genuinely frontend-only shapes are declared by hand below.
 */
import type { components } from "./api";

type Schemas = components["schemas"];

/**
 * Re-require fields the server always sends.
 *
 * A Pydantic field with a default is "not required" in the OpenAPI document,
 * so the generator marks it optional — but responses always carry it, because
 * FastAPI serializes the whole model. Narrowing here beats sprinkling `?? []`
 * over every consumer.
 */
type AlwaysSent<T, K extends keyof T> = Omit<T, K> & {
  [P in K]-?: NonNullable<T[P]>;
};

export type ProviderStatus = Schemas["ProviderStatus"];
export type ProviderApiKey = Schemas["ProviderApiKey"];
export type ProviderSettingsItem = AlwaysSent<Schemas["ProviderSettingsItem"], "keys">;
export type ProviderSettingsPayload = Omit<Schemas["ProviderSettingsPayload"], "providers"> & {
  providers: ProviderSettingsItem[];
};

export type ProcessingOptions = Schemas["ProcessingOptions"];

export type PresetItem = Schemas["PresetItem"];
export type CreatePresetRequest = Schemas["CreatePresetRequest"];
export type UpdatePresetRequest = Schemas["UpdatePresetRequest"];

export type ModelCatalogItem = Schemas["ModelCatalogItem"];
export type ModelStorageConfig = Schemas["ModelStorageConfig"];
export type ModelBenchmarkImageResult = Schemas["ModelBenchmarkImageResult"];
export type ModelBenchmarkResult = Schemas["ModelBenchmarkResult"];
export type ModelBenchmarkReport = Schemas["ModelBenchmarkReport"];
export type ModelBenchmarkStatus = Schemas["ModelBenchmarkStatus"];

export type ModelInstallState = ModelCatalogItem["install_state"];
export type ModelTask = ModelCatalogItem["task"];
export type ModelEngine = ModelCatalogItem["engine"];
export type BenchmarkState = ModelBenchmarkStatus["state"];

export type WatchFolderItem = Schemas["WatchFolderItem"];
export type WatchFolderPayload = Schemas["WatchFolderCreateRequest"];
export type WatchFolderStatus = WatchFolderItem["status"];

export type JobFileResult = Schemas["JobFileResult"];
export type JobResponse = Omit<Schemas["JobResponse"], "files"> & {
  files: JobFileResult[];
};
export type JobState = JobResponse["state"];

export type HistoryItem = Schemas["HistoryItem"];

/**
 * An upload as the UI tracks it: the backend's record plus client-side state
 * (object URL for the thumbnail, dedup fingerprint, pending mask drawing) that
 * never crosses the wire.
 */
export type UploadItem = Schemas["UploadItem"] & {
  preview_url?: string;
  fingerprint?: string;
  mask_hint_data_url?: string;
};
