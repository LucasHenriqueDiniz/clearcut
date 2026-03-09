"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Download, FolderOpen, Grid2x2, Layers3, PanelLeft, Play, Settings2, SunMedium, Tags, Upload } from "lucide-react";
import { HistoryList } from "@/features/history/history-list";
import { JobQueue }       from "@/features/jobs/job-queue";
import { MaskEditorModal } from "@/features/jobs/mask-editor-modal";
import { JobSettingsPanel } from "@/features/settings/job-settings-panel";
import { AppSettings } from "@/features/settings/app-settings";
import { ProvidersSettings } from "@/features/settings/providers-settings";
import { Button } from "@/components/ui";
import { ToastItem, ToastStack } from "@/components/toast-stack";
import { AppSidebar } from "@/components/app-sidebar";
import { WindowTitlebar } from "@/components/window-titlebar";
import {
  getDesktopPreviewSrc,
  listenDesktopFileDrops,
  pickFilePathsForUpload,
  pickFolderFilePathsForUpload,
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
  saveZipOutput,
  uploadFiles,
} from "@/services/api";
import { useAppStore } from "@/stores/use-app-store";
import type { UploadItem } from "@/types";
import { useBackendBaseUrl } from "@/lib/platform";

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [busy,      setBusy]      = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDropActive, setIsDropActive] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const [activeTab,    setActiveTab]    = useState<"workspace" | "providers" | "settings" | "history">("workspace");
  const [workspaceTab, setWorkspaceTab] = useState<"general" | "naming" | "templates">("general");
  const [refineUploadId, setRefineUploadId] = useState<string>();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const dragDepthRef = useRef(0);
  const blobPreviewUrlsRef = useRef<Set<string>>(new Set());
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

  const pageMeta = useMemo(() => {
    if (activeTab === "workspace") {
      if (workspaceTab === "general") {
        return { root: "Workspace", leaf: "General", icon: Grid2x2 };
      }
      if (workspaceTab === "naming") {
        return { root: "Workspace", leaf: "Naming", icon: Tags };
      }
      return { root: "Workspace", leaf: "Templates", icon: Layers3 };
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
  const pushToast = (title: string, description?: string, variant: ToastItem["variant"] = "info") => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, title, description, variant }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  };

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

      const existing = new Set(uploads.map((u) => u.fingerprint).filter(Boolean));
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
        skipped.length ? `Skipped duplicates: ${skipped.join(", ")}` : undefined,
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
      const validPaths = paths.filter((path) => ACCEPTED_EXTENSIONS.has(getFileExtension(path)));
      const invalidNames = paths
        .filter((path) => !ACCEPTED_EXTENSIONS.has(getFileExtension(path)))
        .map((path) => path.split(/[\\/]/).pop() || path);

      if (invalidNames.length) {
        pushToast("Unsupported files skipped", invalidNames.join(", "), "info");
      }

      if (!validPaths.length) {
        return;
      }

      const existing = new Set(
        uploads
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
        skipped.length ? `Skipped duplicates: ${skipped.join(", ")}` : undefined,
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

  return (
    <>
      <div className="flex h-screen w-screen min-h-0 min-w-0 overflow-hidden">
        <AppSidebar
          activeTab={activeTab}
          workspaceTab={workspaceTab}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
          onActiveTabChange={setActiveTab}
          onWorkspaceTabChange={setWorkspaceTab}
        />

        <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
          <WindowTitlebar />
          <main className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
            <div className="flex h-[46px] w-full items-center gap-3 border-b border-white/[0.07] bg-[#111114] pr-4">
              <div className="flex min-w-0 flex-1 items-center">
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed((current) => !current)}
                  className="mr-4 flex h-[46px] w-[46px] items-center justify-center border-r border-white/[0.07] text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-100"
                  aria-label="Toggle sidebar"
                >
                  <PanelLeft className="h-4 w-4" />
                </button>
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-[21px] w-[21px] items-center justify-center rounded-[5px] border border-white/[0.07] bg-[#16161a]">
                    <PageIcon className="h-3 w-3 text-zinc-400" />
                  </div>
                  <span className="text-[12px] text-zinc-500">{pageMeta.root}</span>
                  {pageMeta.leaf ? <span className="text-zinc-700">›</span> : null}
                  {pageMeta.leaf ? <span className="text-[12px] font-semibold text-zinc-100">{pageMeta.leaf}</span> : null}
                </div>
              </div>

              {activeTab === "workspace" ? (
                <div className="flex items-center gap-1.5">
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

            {activeTab === "workspace" ? (
              <div className="grid min-h-0 w-full flex-1 grid-cols-[320px_minmax(0,1fr)] overflow-hidden">
                <JobSettingsPanel
                  className="h-full"
                  activeTab={workspaceTab}
                  onActiveTabChange={setWorkspaceTab}
                  showLocalTabs={false}
                />

                <JobQueue
                  className="h-full"
                  uploads={uploads}
                  uploading={uploading}
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
              <div className="min-h-0 w-full flex-1 overflow-auto">
                <ProvidersSettings />
              </div>
            ) : null}
            {activeTab === "settings" ? (
              <div className="min-h-0 w-full flex-1 overflow-auto">
                <AppSettings />
              </div>
            ) : null}
            {activeTab === "history" ? (
              <div className="min-h-0 w-full flex-1 overflow-auto">
                <HistoryList />
              </div>
            ) : null}
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
      {isDropActive && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
          <div className="rounded-3xl border border-white/15 bg-zinc-950/90 px-10 py-8 text-center shadow-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-zinc-500">Drop files</p>
            <p className="mt-3 text-2xl font-semibold text-zinc-100">Drop images into the queue</p>
            <p className="mt-2 text-sm text-zinc-400">The whole screen accepts files and folders.</p>
          </div>
        </div>
      )}

      <ToastStack
        toasts={toasts}
        onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))}
      />
    </>
  );
}
