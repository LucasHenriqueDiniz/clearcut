"use client";

import { useEffect, useState } from "react";
import { logEvent } from "@/lib/dev-log";

type DesktopRuntime = {
  backend_url: string;
  data_dir: string;
  upload_dir: string;
  output_dir: string;
  models_dir: string;
  logs_dir: string;
  is_tauri: boolean;
};

type SaveAllResult = {
  canceled?: boolean;
  targetDir?: string;
  copiedCount?: number;
};

export type DesktopFileDropEvent = {
  type: "enter" | "over" | "leave" | "drop";
  paths?: string[];
};

const WEB_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "bmp", "gif", "tif", "tiff", "heic", "heif", "avif"]);

let runtimePromise: Promise<DesktopRuntime> | null = null;

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function getExtension(path: string): string {
  return normalizePath(path).split(".").pop()?.toLowerCase() ?? "";
}

function normalizeDialogResult(value: string | string[] | null): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function getDesktopRuntime(): Promise<DesktopRuntime> {
  if (!isTauriEnvironment()) {
    return {
      backend_url: WEB_API_URL,
      data_dir: "",
      upload_dir: "",
      output_dir: "",
      models_dir: "",
      logs_dir: "",
      is_tauri: false,
    };
  }

  if (!runtimePromise) {
    runtimePromise = import("@tauri-apps/api/core").then(({ invoke }) =>
      invoke<DesktopRuntime>("bootstrap_backend").catch((error) => {
        logEvent("error", "bootstrap_backend failed", error);
        throw error;
      }),
    );
  }

  return runtimePromise;
}

export async function getBackendBaseUrl(): Promise<string> {
  const runtime = await getDesktopRuntime();
  return runtime.backend_url;
}

export function useBackendBaseUrl(): string {
  const [baseUrl, setBaseUrl] = useState(WEB_API_URL);

  useEffect(() => {
    let active = true;
    void getBackendBaseUrl().then((url) => {
      if (active) setBaseUrl(url);
    });
    return () => {
      active = false;
    };
  }, []);

  return baseUrl;
}

export function useIsTauri(): boolean {
  const [isTauri, setIsTauri] = useState(false);

  useEffect(() => {
    setIsTauri(isTauriEnvironment());
  }, []);

  return isTauri;
}

function filterImagePaths(paths: string[]): string[] {
  return paths.filter((path) => IMAGE_EXTENSIONS.has(getExtension(path)));
}

export async function getDesktopPreviewSrc(path: string): Promise<string> {
  if (!isTauriEnvironment()) {
    return "";
  }

  const core = await import("@tauri-apps/api/core");
  const convertFileSrc = (core as { convertFileSrc?: (src: string) => string }).convertFileSrc;
  return convertFileSrc ? convertFileSrc(path) : path;
}

export async function pickFilePathsForUpload(): Promise<string[]> {
  if (!isTauriEnvironment()) return [];

  const { open } = await import("@tauri-apps/plugin-dialog");
  const selection = await open({
    multiple: true,
    directory: false,
    filters: [
      {
        name: "Images",
        extensions: Array.from(IMAGE_EXTENSIONS),
      },
    ],
  });

  return filterImagePaths(normalizeDialogResult(selection));
}

export async function pickFolderFilePathsForUpload(): Promise<string[]> {
  if (!isTauriEnvironment()) return [];

  const { open } = await import("@tauri-apps/plugin-dialog");
  const selection = await open({
    multiple: false,
    directory: true,
  });
  const [directory] = normalizeDialogResult(selection);
  if (!directory) return [];

  const { invoke } = await import("@tauri-apps/api/core");
  const paths = await invoke<string[]>("list_supported_images_in_directory", { directory });
  return filterImagePaths(paths);
}

export async function saveAllDesktop(outputPaths: string[]): Promise<SaveAllResult> {
  if (!isTauriEnvironment()) return {};

  const { open } = await import("@tauri-apps/plugin-dialog");
  const selection = await open({
    multiple: false,
    directory: true,
  });
  const [targetDir] = normalizeDialogResult(selection);
  if (!targetDir) return { canceled: true };

  const { invoke } = await import("@tauri-apps/api/core");
  const copiedCount = await invoke<number>("copy_files_to_directory", {
    paths: outputPaths,
    targetDir,
  });

  return { targetDir, copiedCount };
}

export async function saveZipDesktop(zipUrl: string, suggestedName: string): Promise<{ canceled?: boolean; savedPath?: string }> {
  if (!isTauriEnvironment()) return {};

  const { save } = await import("@tauri-apps/plugin-dialog");
  const savePath = await save({
    title: "Save ZIP",
    defaultPath: suggestedName,
    filters: [{ name: "ZIP archive", extensions: ["zip"] }],
  });

  if (!savePath) {
    return { canceled: true };
  }

  const { writeFile } = await import("@tauri-apps/plugin-fs");
  const response = await fetch(zipUrl);
  if (!response.ok) {
    throw new Error(`ZIP download failed: ${response.status}`);
  }
  const buffer = new Uint8Array(await response.arrayBuffer());
  await writeFile(savePath, buffer);
  return { savedPath: savePath };
}

export async function openOutputFolderDesktop(outputPath?: string): Promise<void> {
  if (!isTauriEnvironment()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("open_path_in_os", { path: outputPath });
}

export async function revealFileDesktop(path: string): Promise<void> {
  if (!isTauriEnvironment()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("reveal_file_in_os", { path });
}

export async function listenDesktopFileDrops(
  onEvent: (event: DesktopFileDropEvent) => void | Promise<void>,
): Promise<() => void> {
  if (!isTauriEnvironment()) return () => {};

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const unlisten = await getCurrentWindow().onDragDropEvent(async (event) => {
    const payload = event.payload;

    if (payload.type === "enter") {
      await onEvent({ type: "enter", paths: payload.paths });
      return;
    }
    if (payload.type === "over") {
      await onEvent({ type: "over" });
      return;
    }
    if (payload.type === "leave") {
      await onEvent({ type: "leave" });
      return;
    }

    await onEvent({ type: "drop", paths: filterImagePaths(payload.paths) });
  });

  return unlisten;
}
