import type {
  HistoryItem,
  JobResponse,
  ProcessingOptions,
  ProviderSettingsPayload,
  ProviderStatus,
  UploadItem,
} from "@/types";
import {
  getBackendBaseUrl,
  isTauriEnvironment,
  openOutputFolderDesktop,
  revealFileDesktop,
  saveAllDesktop,
  saveZipDesktop,
} from "@/lib/platform";

const UPLOAD_CHUNK_SIZE = 12;
const UPLOAD_RETRIES = 5;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeError(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Upload timed out";
  }
  if (error instanceof TypeError) {
    return "Network request failed";
  }
  return error instanceof Error ? error.message : String(error);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const apiUrl = await getBackendBaseUrl();
  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export async function uploadFiles(files: File[]): Promise<UploadItem[]> {
  async function uploadChunk(chunk: File[]): Promise<UploadItem[]> {
    let lastError: unknown;
    const maxAttempts = chunk.length === 1 ? UPLOAD_RETRIES + 3 : UPLOAD_RETRIES;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const form = new FormData();
        chunk.forEach((file) => form.append("files", file));

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), chunk.length === 1 ? 240000 : 180000);

        try {
          const apiUrl = await getBackendBaseUrl();
          const res = await fetch(`${apiUrl}/jobs/upload`, {
            method: "POST",
            body: form,
            signal: controller.signal,
          });

          if (!res.ok) {
            throw new Error(await res.text());
          }

          return (await res.json()) as UploadItem[];
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          await sleep(Math.min(5000, 900 * attempt));
        }
      }
    }

    if (chunk.length > 1) {
      const midpoint = Math.ceil(chunk.length / 2);
      const left = await uploadChunk(chunk.slice(0, midpoint));
      const right = await uploadChunk(chunk.slice(midpoint));
      return [...left, ...right];
    }

    throw new Error(`Upload failed for ${chunk[0]?.name ?? "file"}: ${describeError(lastError)}`);
  }

  const uploaded: UploadItem[] = [];
  for (let start = 0; start < files.length; start += UPLOAD_CHUNK_SIZE) {
    const chunk = files.slice(start, start + UPLOAD_CHUNK_SIZE);
    const items = await uploadChunk(chunk);
    uploaded.push(...items);
  }
  return uploaded;
}

export async function ingestDesktopPaths(paths: string[]): Promise<UploadItem[]> {
  return request("/jobs/ingest-paths", {
    method: "POST",
    body: JSON.stringify({ paths }),
  });
}

export async function createJob(uploadIds: string[], options: ProcessingOptions): Promise<{ job_id: string }> {
  return request("/jobs", {
    method: "POST",
    body: JSON.stringify({ upload_ids: uploadIds, options }),
  });
}

export async function createJobWithMasks(
  uploads: UploadItem[],
  options: ProcessingOptions,
): Promise<{ job_id: string }> {
  const mask_hints = Object.fromEntries(
    uploads
      .filter((item) => item.mask_hint_data_url)
      .map((item) => [item.upload_id, item.mask_hint_data_url as string]),
  );
  return request("/jobs", {
    method: "POST",
    body: JSON.stringify({ upload_ids: uploads.map((item) => item.upload_id), mask_hints, options }),
  });
}

export async function getJob(jobId: string): Promise<JobResponse> {
  return request(`/jobs/${jobId}`);
}

export async function cancelJob(jobId: string): Promise<void> {
  await request(`/jobs/${jobId}/cancel`, { method: "POST" });
}

export function downloadZip(jobId: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/jobs/${jobId}/zip`;
}

export async function getDownloadZipUrl(jobId: string): Promise<string> {
  const apiUrl = await getBackendBaseUrl();
  return `${apiUrl}/jobs/${jobId}/zip`;
}

export async function saveZipOutput(jobId: string, suggestedName: string): Promise<{ canceled?: boolean; savedPath?: string }> {
  if (!isTauriEnvironment()) {
    const url = downloadZip(jobId);
    window.open(url, "_blank", "noopener,noreferrer");
    return {};
  }

  const zipUrl = await getDownloadZipUrl(jobId);
  return saveZipDesktop(zipUrl, suggestedName);
}

export async function getOutputDownloadUrl(path: string): Promise<string> {
  const apiUrl = await getBackendBaseUrl();
  return `${apiUrl}/jobs/download?path=${encodeURIComponent(path)}`;
}

export async function getProvidersStatus(): Promise<ProviderStatus[]> {
  return request("/providers/status");
}

export async function getProviderSettings(): Promise<ProviderSettingsPayload> {
  return request("/providers/settings");
}

export async function saveProviderSettings(payload: ProviderSettingsPayload): Promise<ProviderSettingsPayload> {
  return request("/providers/settings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function testProvider(providerName: string): Promise<{ ok: boolean; message: string }> {
  return request(`/providers/test/${providerName}`, { method: "POST" });
}

export async function listHistory(): Promise<HistoryItem[]> {
  return request("/history");
}

export async function deleteHistoryItem(id: number): Promise<void> {
  await request(`/history/${id}`, { method: "DELETE" });
}

export async function revealInFolder(path: string): Promise<{
  ok: boolean;
  opened: boolean;
  file_path: string;
  host_path_hint: string;
  message: string;
}> {
  if (isTauriEnvironment()) {
    await revealFileDesktop(path);
    return {
      ok: true,
      opened: true,
      file_path: path,
      host_path_hint: path,
      message: "File revealed.",
    };
  }
  return request("/fs/reveal?path=" + encodeURIComponent(path), { method: "POST", headers: {} });
}

export async function openOutputFolder(): Promise<{
  ok: boolean;
  opened: boolean;
  output_path: string;
  host_output_hint: string;
  message: string;
}> {
  if (isTauriEnvironment()) {
    await openOutputFolderDesktop();
    return {
      ok: true,
      opened: true,
      output_path: "",
      host_output_hint: "",
      message: "Output folder opened.",
    };
  }
  return request("/fs/open-output", { method: "POST", headers: {} });
}

export async function saveAllOutputs(outputPaths: string[]): Promise<{
  ok: boolean;
  opened: boolean;
  output_path: string;
  host_output_hint: string;
  message: string;
  copied_count?: number;
  canceled?: boolean;
}> {
  if (isTauriEnvironment()) {
    const result = await saveAllDesktop(outputPaths);
    if (result.canceled) {
      return {
        ok: true,
        opened: false,
        output_path: "",
        host_output_hint: "",
        message: "Save all canceled.",
        copied_count: 0,
        canceled: true,
      };
    }
    return {
      ok: true,
      opened: true,
      output_path: result.targetDir ?? "",
      host_output_hint: result.targetDir ?? "",
      message: "Saved all outputs to selected folder.",
      copied_count: result.copiedCount ?? 0,
    };
  }
  throw new Error("Desktop save-all is not available in web mode.");
}
