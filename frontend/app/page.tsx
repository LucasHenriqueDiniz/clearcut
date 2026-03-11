"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Clock3, Download, FolderOpen, Github, Grid2x2, Layers3, PanelLeft, Play, Settings2, SlidersHorizontal, SunMedium, Tags, Upload } from "lucide-react";
import { HistoryList } from "@/features/history/history-list";
import { JobQueue }       from "@/features/jobs/job-queue";
import { MaskEditorModal } from "@/features/jobs/mask-editor-modal";
import { JobSettingsPanel } from "@/features/settings/job-settings-panel";
import { AppSettings } from "@/features/settings/app-settings";
import { ProvidersSettings } from "@/features/settings/providers-settings";
import { Button } from "@/components/ui";
import { ToastItem, ToastStack } from "@/components/toast-stack";
import { DevConsole } from "@/components/dev-console";
import { WindowTitlebar } from "@/components/window-titlebar";
import {
  getBackendBaseUrl,
  expandDesktopPaths,
  getDesktopPreviewSrc,
  listenDesktopFileDrops,
  openPathDesktop,
  pickFilePathsForUpload,
  pickFolderFilePathsForUpload,
  preloadDesktopRuntime,
  useIsTauri,
} from "@/lib/platform";
import {
  cancelJob,
  createJobWithMasks,
  downloadZip,
  getJob,
  ingestDesktopPaths,
  openOutputFolder,
  saveAllOutputs,
  saveSingleOutput,
  saveZipOutput,
  uploadFiles,
} from "@/services/api";
import { useAppStore } from "@/stores/use-app-store";
import type { UploadItem } from "@/types";
import { useBackendBaseUrl } from "@/lib/platform";
import { logEvent } from "@/lib/dev-log";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const ACCEPTED_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "bmp",
  "gif",
  "tif",
  "tiff",
  "heic",
  "heif",
  "avif",
]);
const APP_VERSION = "0.1.0";
const PROJECT_GITHUB_URL = "https://github.com/LucasHenriqueDiniz/clearcut";
const LATEST_RELEASE_URL = "https://github.com/LucasHenriqueDiniz/clearcut/releases/latest";

function getFileExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx < 0) return "";
  return name.slice(idx + 1).toLowerCase();
}

function normalizeDesktopPathKey(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

function isBlobPreview(item: Pick<UploadItem, "storage_mode" | "preview_url">): boolean {
  return item.storage_mode === "uploaded_blob" && typeof item.preview_url === "string" && item.preview_url.startsWith("blob:");
}

async function buildFingerprint(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return (
    Array.from(new Uint8Array(digest))
      .slice(0, 16)
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("") + `:${file.size}`
  );
}

function normalizeVersion(version: string): number[] {
  return version
    .trim()
    .replace(/^v/i, "")
    .split("-")[0]
    .split(".")
    .map((part) => Number(part) || 0);
}

function compareVersions(a: string, b: string): number {
  const av = normalizeVersion(a);
  const bv = normalizeVersion(b);
  const len = Math.max(av.length, bv.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (av[i] ?? 0) - (bv[i] ?? 0);
    if (diff > 0) return 1;
    if (diff < 0) return -1;
  }
  return 0;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [busy,      setBusy]      = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDropActive, setIsDropActive] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [devOpen, setDevOpen] = useState(false);
  const [closingBackend, setClosingBackend] = useState(false);
  const [engineStarting, setEngineStarting] = useState(false);

  const [activeTab,    setActiveTab]    = useState<"workspace" | "providers" | "settings" | "history">("workspace");
  const [workspaceTab, setWorkspaceTab] = useState<"general" | "naming" | "presets" | "batch">("general");
  const [refineUploadId, setRefineUploadId] = useState<string>();
  const [settingsPanelCollapsed, setSettingsPanelCollapsed] = useState(false);
  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ version: string; url: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const dragDepthRef = useRef(0);
  const blobPreviewUrlsRef = useRef<Set<string>>(new Set());
  const keyBufferRef = useRef<string[]>([]);
  const updateToastShownRef = useRef(false);
  const workspacePickerRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const navDragStateRef = useRef<{ startX: number; startY: number; dragged: boolean } | null>(null);
  const desktopWindowRef = useRef<{ startDragging: () => Promise<void> } | null>(null);
  const isDesktopMode = useIsTauri();
  const outputBaseUrl = useBackendBaseUrl();

  const {
    uploads,
    addUploads,
    updateUpload,
    removeUpload,
    setCurrentJob,
    mergeJobResults,
    currentJob,
    resultByInput,
    options,
    skipDuplicates,
  } = useAppStore();

  const refineItem   = useMemo(() => uploads.find((u) => u.upload_id === refineUploadId), [refineUploadId, uploads]);
  const refineResult = refineItem ? resultByInput[refineItem.path] : undefined;
  const refineOutputUrl = refineResult?.output_path
    ? `${outputBaseUrl}/jobs/download?path=${encodeURIComponent(refineResult.output_path)}`
    : undefined;

  useEffect(() => {
    if (refineUploadId && !uploads.some((u) => u.upload_id === refineUploadId)) {
      setRefineUploadId(undefined);
    }
  }, [refineUploadId, uploads]);

  useEffect(() => {
    const currentBlobUrls = new Set(
      uploads.filter(isBlobPreview).map((item) => item.preview_url as string),
    );
    for (const url of blobPreviewUrlsRef.current) {
      if (!currentBlobUrls.has(url)) {
        URL.revokeObjectURL(url);
      }
    }
    blobPreviewUrlsRef.current = currentBlobUrls;
  }, [uploads]);

  useEffect(() => () => {
    for (const url of blobPreviewUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    blobPreviewUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    if (!isDesktopMode) {
      desktopWindowRef.current = null;
      return;
    }
    let cancelled = false;
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      if (!cancelled) {
        desktopWindowRef.current = getCurrentWindow();
      }
    });
    return () => {
      cancelled = true;
      desktopWindowRef.current = null;
    };
  }, [isDesktopMode]);

  const chooseFiles = async () => {
    if (isDesktopMode) {
      const paths = await pickFilePathsForUpload();
      if (paths.length) await handleDesktopPaths(paths);
      return;
    }
  };

  const chooseFolder = async () => {
    if (isDesktopMode) {
      const paths = await pickFolderFilePathsForUpload();
      if (paths.length) await handleDesktopPaths(paths);
      return;
    }
  };

  const pasteImage = async () => {
    try {
      const clipboardItems = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of clipboardItems) {
        for (const type of item.types) {
          if (!type.startsWith("image/")) continue;
          const blob = await item.getType(type);
          const extension = type.split("/")[1] || "png";
          files.push(new File([blob], `clipboard-${Date.now()}.${extension}`, { type: blob.type }));
        }
      }
      if (files.length) {
        await handleFiles(files);
      } else {
        pushToast("Clipboard is empty", "Clipboard does not contain an image.", "info");
      }
    } catch (e) {
      pushToast("Clipboard read failed", String(e), "error");
    }
  };

  useEffect(() => {
    const targetIsEditable = () => {
      const active = document.activeElement as HTMLElement | null;
      if (!active) return false;
      const tag = active.tagName;
      return active.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    };

    const onPaste = (event: ClipboardEvent) => {
      if (targetIsEditable()) return;
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith("image/"));
      if (!files.length) return;
      event.preventDefault();
      void handleFiles(files);
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [uploads]);

  useEffect(() => {
    if (!isDesktopMode) return;
    let active = true;
    const timer = window.setTimeout(() => {
      if (active) setEngineStarting(true);
    }, 800);

    preloadDesktopRuntime();
    void getBackendBaseUrl()
      .then(() => {
        if (active) setEngineStarting(false);
      })
      .catch(() => {
        if (active) setEngineStarting(false);
      })
      .finally(() => window.clearTimeout(timer));

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [isDesktopMode]);

  useEffect(() => {
    if (!isDesktopMode) return;
    let unlistenClosing: (() => void) | null = null;
    let unlistenClosed: (() => void) | null = null;

    void import("@tauri-apps/api/event").then(({ listen }) => {
      listen("backend-closing", () => setClosingBackend(true)).then((unlisten) => {
        unlistenClosing = unlisten;
      });
      listen("backend-closed", () => setClosingBackend(false)).then((unlisten) => {
        unlistenClosed = unlisten;
      });
    });

    return () => {
      unlistenClosing?.();
      unlistenClosed?.();
    };
  }, [isDesktopMode]);

  // ── Job polling ──────────────────────────────────────────────────────────
  const pollJob = async (jobId: string) => {
    const status = await getJob(jobId);
    setCurrentJob(status);
    mergeJobResults(status);
    if (status.state === "processing" || status.state === "queued") {
      setTimeout(() => void pollJob(jobId), 700);
      return;
    }
    setBusy(false);
  };

  const runJob = async () => {
    if (!uploads.length) return;
    setBusy(true);
    try {
      const job = await createJobWithMasks(uploads, options);
      await pollJob(job.job_id);
    } catch (e) {
      setBusy(false);
      pushToast("Batch failed to start", String(e), "error");
    }
  };

  const rerunItem = async (item: Parameters<typeof createJobWithMasks>[0][0]) => {
    try {
      setBusy(true);
      pushToast("Re-running item", item.filename, "info");
      const job = await createJobWithMasks([item], options);
      await pollJob(job.job_id);
      pushToast("Re-run finished", item.filename, "success");
    } catch (e) {
      setBusy(false);
      pushToast("Re-run failed", String(e), "error");
    }
  };

  const canRun = useMemo(
    () => uploads.length > 0 && !busy && !uploading,
    [uploads.length, busy, uploading],
  );
  const workspaceTabs = useMemo(
    () => [
      { id: "general", label: "General", icon: Grid2x2, hint: "Workflow and export" },
      { id: "naming", label: "Naming", icon: Tags, hint: "Filename and destination" },
      { id: "presets", label: "Presets", icon: Layers3, hint: "Saved configurations" },
      { id: "batch", label: "Batch", icon: SlidersHorizontal, hint: "Queue and performance" },
    ] as const,
    [],
  );
  const pushToast = useCallback((title: string, description?: string, variant: ToastItem["variant"] = "info") => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, title, description, variant }]);
    if (variant === "error") {
      logEvent("error", title, description);
    } else if (variant === "info") {
      logEvent("info", title, description);
    }
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  }, []);

  const pageMeta = useMemo(() => {
    if (activeTab === "workspace") {
      if (workspaceTab === "general") {
        return { root: "Workspace", leaf: "General", icon: Grid2x2 };
      }
      if (workspaceTab === "naming") {
        return { root: "Workspace", leaf: "Naming", icon: Tags };
      }
      if (workspaceTab === "presets") {
        return { root: "Workspace", leaf: "Presets", icon: Layers3 };
      }
      return { root: "Workspace", leaf: "Batch", icon: Settings2 };
    }
    if (activeTab === "providers") {
      return { root: "Providers", leaf: "", icon: SunMedium };
    }
    if (activeTab === "settings") {
      return { root: "Settings", leaf: "", icon: Settings2 };
    }
    return { root: "History", leaf: "", icon: Clock3 };
  }, [activeTab, workspaceTab]);
  const PageIcon = pageMeta.icon;
  useEffect(() => {
    if (activeTab !== "workspace" && workspacePickerOpen) {
      setWorkspacePickerOpen(false);
    }
  }, [activeTab, workspacePickerOpen]);

  useEffect(() => {
    let active = true;
    const checkForUpdates = async () => {
      try {
        const response = await fetch("https://api.github.com/repos/LucasHenriqueDiniz/clearcut/releases/latest", {
          headers: { Accept: "application/vnd.github+json" },
        });
        if (!response.ok) return;
        const payload = await response.json();
        if (!active || typeof payload?.tag_name !== "string") return;
        const latestVersion = payload.tag_name;
        const latestUrl = typeof payload?.html_url === "string" ? payload.html_url : LATEST_RELEASE_URL;
        if (compareVersions(latestVersion, APP_VERSION) <= 0) return;
        setUpdateInfo({ version: latestVersion, url: latestUrl });
        if (updateToastShownRef.current) return;
        updateToastShownRef.current = true;
        pushToast("Update available", `${latestVersion} is available. Click update in the footer.`, "info");
      } catch {
        // Silent fail: no network or API rate limit should not disrupt app usage.
      }
    };
    void checkForUpdates();
    return () => {
      active = false;
    };
  }, [pushToast]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        setDevOpen((current) => !current);
        return;
      }

      const key = event.key.toLowerCase();
      if (key.length !== 1) return;
      const buffer = keyBufferRef.current;
      buffer.push(key);
      if (buffer.length > 5) buffer.shift();
      if (buffer.join("") === "debug") {
        setDevOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!workspacePickerOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!workspacePickerRef.current) return;
      if (workspacePickerRef.current.contains(event.target as Node)) return;
      setWorkspacePickerOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [workspacePickerOpen]);

  // ── Upload handler ───────────────────────────────────────────────────────
  const handleFiles = async (files: File[]) => {
    setUploading(true);
    try {
      const validFiles = files.filter((file) => ACCEPTED_EXTENSIONS.has(getFileExtension(file.name)));
      const invalidNames = files
        .filter((file) => !ACCEPTED_EXTENSIONS.has(getFileExtension(file.name)))
        .map((file) => file.name);

      if (invalidNames.length) {
        pushToast(
          "Unsupported files skipped",
          invalidNames.join(", "),
          "info",
        );
      }

      if (!validFiles.length) {
        return;
      }

      const existing = new Set(
        (skipDuplicates ? uploads.map((u) => u.fingerprint).filter(Boolean) : []),
      );
      const unique: File[] = [], fps: string[] = [], skipped: string[] = [];

      for (const file of validFiles) {
        const fp = await buildFingerprint(file);
        if (existing.has(fp)) { skipped.push(file.name); continue; }
        existing.add(fp); unique.push(file); fps.push(fp);
      }

      if (!unique.length) {
        pushToast(
          `Skipped duplicate${skipped.length > 1 ? "s" : ""}`,
          skipped.join(", "),
          "info",
        );
        return;
      }

      const saved = await uploadFiles(unique);
      addUploads(
        saved.map((s, i) => ({
          ...s,
          preview_url: URL.createObjectURL(unique[i]),
          fingerprint: fps[i],
        })),
      );
      pushToast(
        `Uploaded ${saved.length} file(s)`,
        skipDuplicates && skipped.length ? `Skipped duplicates: ${skipped.join(", ")}` : undefined,
        "success",
      );
    } catch (e) {
      pushToast("Upload failed", String(e), "error");
    } finally {
      setUploading(false);
    }
  };

  const handleDesktopPaths = async (paths: string[]) => {
    setUploading(true);
    try {
      const expandedPaths = await expandDesktopPaths(paths);
      const validPaths = expandedPaths.filter((path) => ACCEPTED_EXTENSIONS.has(getFileExtension(path)));
      const invalidNames = paths
        .filter((path) => {
          const ext = getFileExtension(path);
          return ext.length > 0 && !ACCEPTED_EXTENSIONS.has(ext);
        })
        .map((path) => path.split(/[\\/]/).pop() || path);

      if (invalidNames.length) {
        pushToast("Unsupported files skipped", invalidNames.join(", "), "info");
      }

      if (!validPaths.length) {
        return;
      }

      const existing = new Set(
        (skipDuplicates ? uploads : [])
          .filter((item) => item.storage_mode === "desktop_path")
          .map((item) => item.source_path || item.path)
          .filter(Boolean)
          .map((path) => normalizeDesktopPathKey(path as string)),
      );
      const unique: string[] = [];
      const skipped: string[] = [];

      for (const path of validPaths) {
        const normalizedPath = normalizeDesktopPathKey(path);
        if (existing.has(normalizedPath)) {
          skipped.push(path.split(/[\\/]/).pop() || path);
          continue;
        }
        existing.add(normalizedPath);
        unique.push(path);
      }

      if (!unique.length) {
        pushToast(
          `Skipped duplicate${skipped.length > 1 ? "s" : ""}`,
          skipped.join(", "),
          "info",
        );
        return;
      }

      const saved = await ingestDesktopPaths(unique);
      const desktopItems = await Promise.all(
        saved.map(async (item) => {
          const previewPath = item.source_path || item.path;
          return {
            ...item,
            preview_url: previewPath ? await getDesktopPreviewSrc(previewPath) : undefined,
          };
        }),
      );
      addUploads(desktopItems);
      pushToast(
        `Ingested ${desktopItems.length} file(s)`,
        skipDuplicates && skipped.length ? `Skipped duplicates: ${skipped.join(", ")}` : undefined,
        "success",
      );
    } catch (e) {
      pushToast("Ingest failed", String(e), "error");
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (isDesktopMode) return;

    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");

    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDropActive(true);
    };

    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer!.dropEffect = "copy";
      setIsDropActive(true);
    };

    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsDropActive(false);
      }
    };

    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDropActive(false);
      const droppedFiles = Array.from(event.dataTransfer?.files ?? []);
      if (droppedFiles.length) {
        void handleFiles(droppedFiles);
      }
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [uploads, isDesktopMode]);

  useEffect(() => {
    if (!isDesktopMode) return;

    let unlisten: (() => void) | undefined;
    void listenDesktopFileDrops(async (event) => {
      if (event.type === "enter" || event.type === "over") {
        setIsDropActive(true);
        return;
      }
      if (event.type === "leave") {
        setIsDropActive(false);
        return;
      }
      setIsDropActive(false);
      if (event.paths?.length) {
        await handleDesktopPaths(event.paths);
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [isDesktopMode, uploads]);

  // ─────────────────────────────────────────────────────────────────────────

  const handleOpenOutput = async () => {
    try {
      const result = await openOutputFolder();
      if (!result.opened) await navigator.clipboard.writeText(result.host_output_hint);
      pushToast(
        result.opened ? "Output folder opened" : "Output folder path copied",
        result.opened ? result.message : `${result.message} — path copied`,
        "success",
      );
    } catch (e) {
      pushToast("Open output failed", String(e), "error");
    }
  };

  const handleSaveAll = async () => {
    const files = currentJob?.files.filter((file) => file.output_path && file.state === "done") ?? [];
    if (!files.length) {
      pushToast("Nothing to save", "Process at least one file before using Save all.", "info");
      return;
    }

    if (isDesktopMode) {
      try {
        const result = await saveAllOutputs(files.map((file) => file.output_path!));
        if (result.canceled) {
          pushToast("Save all canceled", "No destination folder selected.", "info");
          return;
        }
        pushToast(
          "Saved all outputs",
          `${result.copied_count ?? files.length} file(s) copied to ${result.output_path}`,
          "success",
        );
      } catch (e) {
        pushToast("Save all failed", String(e), "error");
      }
      return;
    }

    pushToast("Save all unavailable", "Desktop runtime is required for this action.", "error");
  };

  const handleDownloadZip = async () => {
    if (!currentJob) return;
    try {
      const suggestedName = `clearcut-${currentJob.job_id}.zip`;
      if (isDesktopMode) {
        const result = await saveZipOutput(currentJob.job_id, suggestedName);
        if (result.canceled) {
          pushToast("Save as ZIP canceled", "No destination file selected.", "info");
          return;
        }
        pushToast("ZIP saved", result.savedPath ?? suggestedName, "success");
        return;
      }

      const zipUrl = downloadZip(currentJob.job_id);
      window.open(zipUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      pushToast("ZIP download failed", String(e), "error");
    }
  };

  const handleDownloadItem = async (item: UploadItem) => {
    const result = resultByInput[item.path];
    if (!result?.output_path) {
      pushToast("Output not ready", "This item has no generated output yet.", "info");
      return;
    }
    try {
      await saveSingleOutput(result.output_path, result.output_filename || item.filename);
    } catch (error) {
      pushToast("Download failed", String(error), "error");
    }
  };

  const openExternalLink = useCallback(async (url: string) => {
    try {
      if (isDesktopMode) {
        await openPathDesktop(url);
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      pushToast("Open link failed", String(error), "error");
    }
  }, [isDesktopMode, pushToast]);

  const handleTitlebarMouseDown = (event: ReactMouseEvent<HTMLElement>, onClick?: () => void) => {
    if (!isDesktopMode) return;
    if (event.button !== 0) return;
    if (event.detail > 1) return;
    if ((event.target as HTMLElement).closest("[data-titlebar-ignore-drag]")) return;

    if (!onClick) {
      event.preventDefault();
      const win = desktopWindowRef.current;
      if (win) void win.startDragging();
      return;
    }

    navDragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      dragged: false,
    };

    const onMove = (moveEvent: MouseEvent) => {
      const dragState = navDragStateRef.current;
      if (!dragState || dragState.dragged) return;
      const deltaX = Math.abs(moveEvent.clientX - dragState.startX);
      const deltaY = Math.abs(moveEvent.clientY - dragState.startY);
      if (deltaX + deltaY < 6) return;
      dragState.dragged = true;
      const win = desktopWindowRef.current;
      if (win) void win.startDragging();
    };

    const onUp = () => {
      const dragState = navDragStateRef.current;
      navDragStateRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!dragState?.dragged && onClick) {
        onClick();
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  useEffect(() => {
    if (!contextMenu) return;
    const onPointerDown = (event: MouseEvent) => {
      if (contextMenuRef.current?.contains(event.target as Node)) return;
      setContextMenu(null);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [contextMenu]);

  return (
    <>
      <div
        className="flex h-screen w-screen min-h-0 min-w-0 overflow-hidden"
        onContextMenu={(event) => {
          event.preventDefault();
          const width = 210;
          const height = 238;
          const x = Math.min(event.clientX, window.innerWidth - width - 10);
          const y = Math.min(event.clientY, window.innerHeight - height - 10);
          setContextMenu({ x: Math.max(8, x), y: Math.max(8, y) });
        }}
      >
        <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
          <WindowTitlebar
            onMouseDown={(event) => handleTitlebarMouseDown(event)}
            left={(
              <div className="flex h-full min-w-0 items-center">
                <div className="flex h-full items-center gap-2 pr-4">
                  <img src="/icon.png" alt="ClearCut logo" className="h-[18px] w-[18px] rounded-[5px] border border-white/[0.12] object-cover" />
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600">ClearCut</span>
                </div>
                <div className="flex h-full items-center border-l border-r border-white/[0.07]">
                  <button
                    type="button"
                    className={`relative h-full px-4 text-[11px] ${activeTab === "workspace" ? "bg-white/[0.022] text-zinc-100" : "text-zinc-500 hover:bg-white/[0.02] hover:text-zinc-300"}`}
                    onMouseDown={(event) => {
                      event.stopPropagation();
                      handleTitlebarMouseDown(event, () => setActiveTab("workspace"));
                    }}
                    onClick={() => !isDesktopMode && setActiveTab("workspace")}
                  >
                    Workspace
                  </button>
                  <button
                    type="button"
                    className={`relative h-full border-l border-white/[0.07] px-4 text-[11px] ${activeTab === "providers" ? "bg-white/[0.022] text-zinc-100" : "text-zinc-500 hover:bg-white/[0.02] hover:text-zinc-300"}`}
                    onMouseDown={(event) => {
                      event.stopPropagation();
                      handleTitlebarMouseDown(event, () => setActiveTab("providers"));
                    }}
                    onClick={() => !isDesktopMode && setActiveTab("providers")}
                  >
                    Providers
                  </button>
                  <button
                    type="button"
                    className={`relative h-full border-l border-white/[0.07] px-4 text-[11px] ${activeTab === "settings" ? "bg-white/[0.022] text-zinc-100" : "text-zinc-500 hover:bg-white/[0.02] hover:text-zinc-300"}`}
                    onMouseDown={(event) => {
                      event.stopPropagation();
                      handleTitlebarMouseDown(event, () => setActiveTab("settings"));
                    }}
                    onClick={() => !isDesktopMode && setActiveTab("settings")}
                  >
                    Settings
                  </button>
                  <button
                    type="button"
                    className={`relative h-full border-l border-white/[0.07] px-4 text-[11px] ${activeTab === "history" ? "bg-white/[0.022] text-zinc-100" : "text-zinc-500 hover:bg-white/[0.02] hover:text-zinc-300"}`}
                    onMouseDown={(event) => {
                      event.stopPropagation();
                      handleTitlebarMouseDown(event, () => setActiveTab("history"));
                    }}
                    onClick={() => !isDesktopMode && setActiveTab("history")}
                  >
                    History
                  </button>
                </div>
              </div>
            )}
          />
          <main className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
            <div className="flex h-[46px] w-full items-center gap-3 border-b border-white/[0.07] bg-[#111114] pr-4">
              <div className="flex min-w-0 flex-1 items-center">
                <button
                  type="button"
                  onClick={() => setSettingsPanelCollapsed((current) => !current)}
                  className="mr-4 flex h-[46px] w-[46px] items-center justify-center border-r border-white/[0.07] text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-100"
                  aria-label="Toggle settings panel"
                >
                  <PanelLeft className="h-4 w-4" />
                </button>
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-[21px] w-[21px] items-center justify-center rounded-[5px] border border-white/[0.07] bg-[#16161a]">
                    <PageIcon className="h-3 w-3 text-zinc-400" />
                  </div>
                  <span className="text-[12px] text-zinc-500">{pageMeta.root}</span>
                  {pageMeta.leaf ? <span className="text-zinc-700">›</span> : null}
                  {pageMeta.leaf ? (
                    <div className="relative" ref={workspacePickerRef}>
                      {activeTab === "workspace" ? (
                        <>
                          <button
                            type="button"
                            className="flex items-center gap-1 rounded-[6px] px-1.5 py-1 text-[12px] font-semibold text-zinc-100 transition-colors hover:bg-white/[0.04]"
                            onClick={() => setWorkspacePickerOpen((current) => !current)}
                            aria-label="Choose workspace section"
                          >
                            <span>{pageMeta.leaf}</span>
                            <ChevronDown className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${workspacePickerOpen ? "rotate-180" : ""}`} />
                          </button>
                          {workspacePickerOpen ? (
                            <div className="absolute left-0 top-[calc(100%+6px)] z-40 w-[180px] overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#17171d] p-1 shadow-[0_18px_40px_rgba(0,0,0,0.5)]">
                              {workspaceTabs.map((tab) => {
                                const TabIcon = tab.icon;
                                return (
                                  <button
                                    key={tab.id}
                                    type="button"
                                    className={`flex w-full items-center gap-2 rounded-[7px] px-2.5 py-2 text-left text-[11px] transition-colors ${workspaceTab === tab.id ? "bg-indigo-500/12 text-indigo-300" : "text-zinc-300 hover:bg-white/[0.05]"}`}
                                    onClick={() => {
                                      setWorkspaceTab(tab.id);
                                      setWorkspacePickerOpen(false);
                                    }}
                                  >
                                    <TabIcon className="h-3.5 w-3.5 shrink-0" />
                                    <span>{tab.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-[12px] font-semibold text-zinc-100">{pageMeta.leaf}</span>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              {activeTab === "workspace" ? (
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={handleOpenOutput}>
                    <FolderOpen className="h-3 w-3" />
                    Open output
                  </Button>
                  <Button variant="secondary" size="sm" onClick={handleSaveAll} disabled={!currentJob}>
                    <Download className="h-3 w-3" />
                    Save all
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => void chooseFiles()}>
                    <Upload className="h-3 w-3" />
                    Choose files
                  </Button>
                  <Button variant="primary" size="sm" disabled={!canRun} onClick={runJob}>
                    <Play className="h-3 w-3" />
                    {uploading ? "Uploading…" : busy ? "Processing…" : "Run batch"}
                  </Button>
                </div>
              ) : null}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="min-h-0 w-full flex-1 overflow-hidden"
              >
                {activeTab === "workspace" ? (
                  <div className={`grid min-h-0 h-full w-full overflow-hidden ${settingsPanelCollapsed ? "grid-cols-[0_minmax(0,1fr)]" : "grid-cols-[320px_minmax(0,1fr)]"}`}>
                    <div className={`${settingsPanelCollapsed ? "pointer-events-none opacity-0" : "opacity-100"} min-h-0 transition-opacity duration-150`}>
                      <JobSettingsPanel
                        className="h-full"
                        activeTab={workspaceTab}
                        onActiveTabChange={setWorkspaceTab}
                        showLocalTabs={false}
                      />
                    </div>

                    <JobQueue
                      className="h-full"
                      uploads={uploads}
                      uploading={uploading}
                      engineStarting={engineStarting}
                      currentJob={currentJob}
                      resultByInput={resultByInput}
                      onRemove={removeUpload}
                      onRerun={rerunItem}
                      onSelectRefine={(item) => setRefineUploadId(item.upload_id)}
                      onChooseFiles={() => void chooseFiles()}
                      onChooseFolder={() => void chooseFolder()}
                      onPaste={() => void pasteImage()}
                      onSaveAll={() => void handleSaveAll()}
                      onDownloadZip={() => void handleDownloadZip()}
                      onDownloadItem={(item) => void handleDownloadItem(item)}
                      onCancelJob={() => {
                        if (!currentJob) return;
                        void cancelJob(currentJob.job_id);
                      }}
                      refineUploadId={refineUploadId}
                      isDropActive={isDropActive}
                    />
                  </div>
                ) : null}

                {activeTab === "providers" ? (
                  <div className="min-h-0 h-full w-full overflow-auto">
                    <ProvidersSettings />
                  </div>
                ) : null}
                {activeTab === "settings" ? (
                  <div className="min-h-0 h-full w-full overflow-auto">
                    <AppSettings />
                  </div>
                ) : null}
                {activeTab === "history" ? (
                  <div className="min-h-0 h-full w-full overflow-auto">
                    <HistoryList />
                  </div>
                ) : null}
              </motion.div>
            </AnimatePresence>

            <div className="flex h-[22px] items-center gap-3 border-t border-white/[0.07] bg-[#090909] px-[14px]">
              <div className="flex items-center gap-1 font-mono text-[10px] text-zinc-500">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${busy || currentJob?.state === "processing" ? "animate-pulse bg-indigo-400" : "bg-emerald-400"}`} />
                <span>{busy || currentJob?.state === "processing" ? "Engine processing" : "Engine ready"}</span>
              </div>
              <button
                type="button"
                onClick={() => void openExternalLink(PROJECT_GITHUB_URL)}
                className="inline-flex items-center gap-1 rounded-[4px] border border-white/[0.07] px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 transition-colors hover:border-white/[0.12] hover:bg-white/[0.05] hover:text-zinc-200"
              >
                <Github className="h-3 w-3" />
                GitHub
              </button>
              {updateInfo ? (
                <button
                  type="button"
                  onClick={() => void openExternalLink(LATEST_RELEASE_URL)}
                  className="inline-flex items-center gap-1 rounded-[4px] border border-indigo-400/30 bg-indigo-500/12 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300 transition-colors hover:bg-indigo-500/18"
                >
                  <Download className="h-3 w-3" />
                  Update {updateInfo.version}
                </button>
              ) : null}
              <div className="font-mono text-[10px] text-zinc-500">{options.local_model} · {options.enhance_engine}</div>
              <div className="ml-auto font-mono text-[10px] text-zinc-500">v{APP_VERSION}</div>
            </div>
          </main>
        </div>
      </div>

      <MaskEditorModal
        open={Boolean(refineItem)}
        item={refineItem}
        outputUrl={refineOutputUrl}
        onClose={() => setRefineUploadId(undefined)}
        onSave={(dataUrl) => {
          if (!refineItem) return;
          updateUpload(refineItem.upload_id, { mask_hint_data_url: dataUrl });
          pushToast(
            dataUrl ? "Mask saved" : "Mask disabled",
            dataUrl
              ? `Saved for ${refineItem.filename}. Re-run to apply.`
              : `Disabled for ${refineItem.filename}. Re-run to refresh.`,
            "success",
          );
        }}
      />

      {/* ── Drop overlay ─────────────────────────────────────────────────── */}
      {isDropActive && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-[radial-gradient(ellipse_80%_60%_at_50%_30%,rgba(79,70,229,0.16),transparent),rgba(0,0,0,0.76)] backdrop-blur-[4px]">

          {/* corner bracket accents */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full" xmlns="http://www.w3.org/2000/svg">
            <polyline points="0,56 0,0 56,0"          fill="none" stroke="rgba(99,102,241,0.45)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="calc(100% - 56px),0 100%,0 100%,56"  fill="none" stroke="rgba(99,102,241,0.45)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="0,calc(100% - 56px) 0,100% 56,100%" fill="none" stroke="rgba(99,102,241,0.45)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="calc(100% - 56px),100% 100%,100% 100%,calc(100% - 56px)" fill="none" stroke="rgba(99,102,241,0.45)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>

          {/* card — same language as empty state but faster spin + ping icon */}
<div className="relative w-full max-w-[400px] overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#111114]/90 backdrop-blur-xl shadow-[0_40px_120px_rgba(0,0,0,0.70)] animate-[fade-in_0.14s_ease_both]">            <div className="relative px-8 py-8 text-center">
              {/* pulsing icon */}
              <div className="relative mx-auto h-[60px] w-[60px]">
                <span className="absolute inset-0 animate-ping rounded-[18px] bg-indigo-500/18" style={{ animationDuration: "1.6s" }} />
                <div className="relative flex h-full w-full items-center justify-center rounded-[18px] border border-indigo-400/20 bg-[#16161a] text-indigo-300 shadow-[0_0_0_1px_rgba(99,102,241,0.15),0_20px_48px_rgba(79,70,229,0.26),inset_0_1px_0_rgba(255,255,255,0.06)]">
                  <Upload className="h-[26px] w-[26px]" strokeWidth={1.5} />
                </div>
              </div>

              <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-500">Drop files</p>
              <p className="mt-1.5 text-[22px] font-semibold tracking-[-0.025em] text-[var(--text)]">
                Drop into the queue
              </p>
              <p className="mx-auto mt-2 max-w-[240px] text-[12px] leading-[1.65] text-[var(--muted)]">
                Release to add images and folders to the current queue.
              </p>
            </div>
          </div>
        </div>
      )}

      {closingBackend ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[16px] border border-white/[0.08] bg-[#121217] px-6 py-5 shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
            <div className="flex items-center gap-3">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200" />
              <div>
                <p className="text-[13px] font-semibold text-[var(--text)]">Closing backend…</p>
                <p className="text-[11px] text-[var(--muted)]">Finishing background tasks, please wait.</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {contextMenu ? (
        <div
          ref={contextMenuRef}
          className="fixed z-[180] w-[210px] overflow-hidden rounded-[12px] border border-white/[0.09] bg-[#141419] p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button type="button" className="flex w-full items-center rounded-[8px] px-2.5 py-2 text-left text-[11px] text-zinc-200 transition-colors hover:bg-white/[0.06]" onClick={() => { setContextMenu(null); void runJob(); }}>
            Run batch
          </button>
          <button type="button" className="flex w-full items-center rounded-[8px] px-2.5 py-2 text-left text-[11px] text-zinc-200 transition-colors hover:bg-white/[0.06]" onClick={() => { setContextMenu(null); void handleOpenOutput(); }}>
            Open output folder
          </button>
          <button type="button" className="flex w-full items-center rounded-[8px] px-2.5 py-2 text-left text-[11px] text-zinc-200 transition-colors hover:bg-white/[0.06]" onClick={() => { setContextMenu(null); void handleSaveAll(); }}>
            Save all outputs
          </button>
          <div className="my-1 h-px bg-white/[0.08]" />
          <button type="button" className="flex w-full items-center rounded-[8px] px-2.5 py-2 text-left text-[11px] text-zinc-200 transition-colors hover:bg-white/[0.06]" onClick={() => { setContextMenu(null); void chooseFiles(); }}>
            Choose files
          </button>
          <button type="button" className="flex w-full items-center rounded-[8px] px-2.5 py-2 text-left text-[11px] text-zinc-200 transition-colors hover:bg-white/[0.06]" onClick={() => { setContextMenu(null); void chooseFolder(); }}>
            Choose folder
          </button>
          <button type="button" className="flex w-full items-center rounded-[8px] px-2.5 py-2 text-left text-[11px] text-zinc-200 transition-colors hover:bg-white/[0.06]" onClick={() => { setContextMenu(null); void pasteImage(); }}>
            Paste image
          </button>
        </div>
      ) : null}

      <ToastStack
        toasts={toasts}
        onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))}
      />
      <DevConsole open={devOpen} onClose={() => setDevOpen(false)} />
    </>
  );
}
