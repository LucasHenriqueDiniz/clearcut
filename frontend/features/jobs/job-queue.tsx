"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Brush, ClipboardPaste, Download, FolderOpen, ImageUp, RotateCcw, Square, Trash2 } from "lucide-react";
import { Badge, BadgeProps, Button, ProgressBar, StatusDot } from "@/components/ui";
import { ColorBends } from "@/components/effects/color-bends";
import type { JobFileResult, JobResponse, UploadItem } from "@/types";
import { CompareModal } from "@/features/jobs/compare-modal";
import { cn } from "@/lib/utils";
import { useBackendBaseUrl } from "@/lib/platform";

type Props = {
  uploads: UploadItem[];
  currentJob?: JobResponse;
  resultByInput: Record<string, JobFileResult>;
  onRemove: (id: string) => void;
  onRerun: (item: UploadItem) => void;
  onSelectRefine: (item: UploadItem) => void;
  onChooseFiles: () => void;
  onChooseFolder: () => void;
  onPaste: () => void;
  onSaveAll?: () => void;
  onDownloadZip?: () => void;
  onDownloadItem?: (item: UploadItem) => void;
  onCancelJob?: () => void;
  refineUploadId?: string;
  isDropActive?: boolean;
  engineStarting?: boolean;
  className?: string;
  uploading?: boolean;
};

const STATE_BADGE: Record<string, BadgeProps["variant"]> = {
  done: "success",
  failed: "danger",
  processing: "processing",
  queued: "default",
  canceled: "default",
};

function stateProgress(state: string): number {
  if (state === "done") return 100;
  if (state === "failed") return 100;
  if (state === "canceled") return 100;
  if (state === "processing") return 62;
  return 0;
}

function stateLabel(state: string): string {
  if (state === "canceled") return "canceled";
  return state === "failed" ? "error" : state;
}

function statusDotState(state: string): "idle" | "processing" | "done" | "error" {
  if (state === "done") return "done";
  if (state === "failed") return "error";
  if (state === "processing") return "processing";
  return "idle";
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function itemClassName(state: string, isRefine: boolean): string {
  if (isRefine) {
    return "border-indigo-500/22 bg-indigo-500/[0.07] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_10px_28px_rgba(49,46,129,0.16)]";
  }
  if (state === "done") {
    return "border-emerald-500/[0.14] bg-emerald-500/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]";
  }
  if (state === "processing") {
    return "border-indigo-500/[0.18] bg-indigo-500/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_10px_30px_rgba(67,56,202,0.12)]";
  }
  if (state === "failed") {
    return "border-red-500/[0.16] bg-red-500/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]";
  }
  if (state === "canceled") {
    return "border-white/[0.08] bg-white/[0.015]";
  }
  return "border-transparent bg-transparent hover:border-[var(--border)] hover:bg-white/[0.03] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_10px_24px_rgba(0,0,0,0.18)]";
}

function Thumb({
  src,
  alt,
  label,
  className,
}: {
  src?: string;
  alt: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("relative flex h-[42px] w-[42px] shrink-0 items-center justify-center overflow-hidden rounded-[7px] border border-[var(--border)] bg-[var(--panel)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]", className)}>
      {src ? (
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <span className="text-[9px] font-medium text-[var(--muted)]">{label}</span>
      )}
      <span className="pointer-events-none absolute inset-x-1 bottom-1 h-px bg-gradient-to-r from-transparent via-white/14 to-transparent" />
    </div>
  );
}

function PreviewStack({
  inputSrc,
  outputSrc,
  filename,
}: {
  inputSrc?: string;
  outputSrc?: string;
  filename: string;
}) {
  if (outputSrc) {
    return (
      <div className="relative h-[42px] w-[58px] shrink-0">
        <Thumb src={inputSrc} alt={filename} label="IN" className="absolute left-0 top-0 h-[38px] w-[38px]" />
        <Thumb
          src={outputSrc}
          alt={`${filename} output`}
          label="OUT"
          className="absolute bottom-0 right-0 h-[28px] w-[28px] rounded-[6px] border-white/[0.12] shadow-[0_8px_20px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)]"
        />
      </div>
    );
  }

  return <Thumb src={inputSrc} alt={filename} label="IN" />;
}

export function JobQueue({
  uploads,
  currentJob,
  resultByInput,
  onRemove,
  onRerun,
  onSelectRefine,
  onChooseFiles,
  onChooseFolder,
  onPaste,
  onSaveAll,
  onDownloadZip,
  onDownloadItem,
  onCancelJob,
  refineUploadId,
  isDropActive,
  engineStarting,
  className,
  uploading,
}: Props) {
  const [compareItem, setCompareItem] = useState<UploadItem | null>(null);
  const outputBaseUrl = useBackendBaseUrl();

  const getResult = (item: UploadItem) => resultByInput[item.path];
  const outputUrl = (result?: JobFileResult) =>
    result?.output_path
      ? `${outputBaseUrl}/jobs/download?path=${encodeURIComponent(result.output_path)}`
      : undefined;

  if (!uploads.length) {
    return (
      <div className={cn("flex h-full min-h-0 flex-col bg-[var(--bg)]", className)}>
        <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-8 py-10 text-center">
          <div className="absolute inset-0 opacity-80 pointer-events-none">
            <ColorBends
              colors={["#4f46e5", "#0ea5e9", "#10b981"]}
              speed={0.16}
              scale={0.92}
              frequency={0.92}
              mouseInfluence={0.1}
              parallax={0.3}
              noise={0.04}
              transparent
            />
          </div>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.24),transparent_28%),radial-gradient(circle_at_bottom,rgba(16,185,129,0.14),transparent_34%),linear-gradient(180deg,rgba(10,10,12,0.28),rgba(10,10,12,0.78))]" />
          <div className="relative w-full max-w-lg overflow-hidden rounded-[20px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(17,17,20,0.78),rgba(17,17,20,0.92))] px-7 py-8 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl">
            <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/16 to-transparent" />
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[16px] border border-indigo-400/14 bg-[#16161a]/90 text-indigo-300 shadow-[0_0_0_1px_rgba(99,102,241,0.12),0_18px_40px_rgba(79,70,229,0.16),inset_0_1px_0_rgba(255,255,255,0.05)]">
              <ImageUp className="h-6 w-6" />
            </div>
            <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-500">Queue</p>
            <p className="mt-2 text-xl font-semibold tracking-[-0.02em] text-[var(--text)]">Drop images anywhere on screen</p>
            <p className="mx-auto mt-1 max-w-sm text-[12px] leading-5 text-[var(--muted)]">PNG · JPG · WEBP · BMP · GIF · TIFF · HEIC · AVIF</p>
            {uploading ? (
              <div className="mx-auto mt-5 flex w-full max-w-sm items-center justify-center gap-3 rounded-[11px] border border-white/[0.09] bg-black/20 px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200" />
                <div>
                  <p className="text-sm font-medium text-[var(--text)]">Uploading files...</p>
                  <p className="text-xs text-[var(--muted)]">You can keep dropping more files.</p>
                </div>
              </div>
            ) : null}
            {engineStarting ? (
              <div className="mx-auto mt-3 flex w-full max-w-sm items-center justify-center gap-3 rounded-[11px] border border-indigo-400/20 bg-indigo-500/[0.08] px-4 py-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200" />
                <div>
                  <p className="text-[12px] font-medium text-zinc-100">Engine starting</p>
                  <p className="text-[11px] text-zinc-400">Preparing local model for first run.</p>
                </div>
              </div>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button variant="primary" size="sm" onClick={onChooseFiles}>
                <ImageUp className="h-3.5 w-3.5" />
                Choose files
              </Button>
              <Button variant="secondary" size="sm" onClick={onChooseFolder}>
                <FolderOpen className="h-3.5 w-3.5" />
                Choose folder
              </Button>
              <Button variant="secondary" size="sm" onClick={onPaste}>
                <ClipboardPaste className="h-3.5 w-3.5" />
                Paste image
              </Button>
            </div>
            <p className="mt-5 text-[11px] text-zinc-500">Folders and repeated drops stay in the same queue.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          "flex h-full min-h-0 flex-col border-l border-[var(--border)] bg-[var(--bg)]",
          isDropActive ? "bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.08),transparent_38%),var(--bg)]" : "",
          className,
        )}
      >
        <div className="relative flex h-[46px] items-center gap-[7px] border-b border-[var(--border)] bg-[var(--surface)] px-[14px]">
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Queue</span>
          <div className="h-[18px] w-px bg-[var(--border)]" />
          {currentJob?.state === "processing" ? (
            <Button variant="danger" size="sm" onClick={onCancelJob}>
              <Square className="h-3 w-3" />
              Cancel
            </Button>
          ) : null}
          {currentJob?.state === "processing" ? <div className="mx-[2px] h-[18px] w-px bg-[var(--border)]" /> : null}
          {currentJob ? (
            <Button variant="secondary" size="sm" onClick={onSaveAll}>
              <FolderOpen className="h-3 w-3" />
              Save all
            </Button>
          ) : null}
          {currentJob ? (
            <Button variant="success" size="sm" onClick={onDownloadZip}>
              <Download className="h-3 w-3" />
              Download ZIP
            </Button>
          ) : null}
          <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
            {uploads.length} files
            {currentJob
              ? ` · ${currentJob.files.filter((file) => file.state === "done").length} done · ${currentJob.files.filter((file) => file.state === "processing").length || (currentJob.state === "processing" ? 1 : 0)} processing`
              : ""}
          </span>
        </div>

        <div className="min-h-0 flex-1 space-y-[2px] overflow-y-auto p-[6px]">
          {uploading ? (
            <div className="mb-2 flex items-center gap-3 rounded-[10px] border border-dashed border-indigo-400/18 bg-[linear-gradient(180deg,rgba(79,70,229,0.06),rgba(255,255,255,0.02))] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text)]">Uploading files...</p>
                <p className="text-xs text-[var(--muted)]">You can keep adding files while the queue stays active.</p>
              </div>
            </div>
          ) : null}

          <AnimatePresence initial={false}>
            {uploads.map((item) => {
              const result = getResult(item);
              const state = result?.state ?? "queued";
              const isRefine = refineUploadId === item.upload_id;
              const canEdit = state !== "processing";
              const outputThumbSrc = outputUrl(result);
              const outputFilename = result?.output_filename;

              return (
                <motion.div
                  key={item.upload_id}
                  initial={{ opacity: 0, y: 6, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.985 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className={cn(
                    "group/item relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-[10px] overflow-hidden rounded-[9px] border border-white/[0.06] px-[10px] py-2 transition-all duration-150",
                    itemClassName(state, isRefine),
                  )}
                >
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  {state === "processing" ? (
                    <span className="pointer-events-none absolute inset-y-0 left-[-25%] w-24 bg-gradient-to-r from-transparent via-white/8 to-transparent [animation:queue-sheen_1.8s_ease-in-out_infinite]" />
                  ) : null}

                  <button type="button" className="flex shrink-0 items-center justify-center" onClick={() => setCompareItem(item)}>
                    <PreviewStack inputSrc={item.preview_url} outputSrc={outputThumbSrc} filename={item.filename} />
                  </button>

                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-medium text-[var(--text)]">{item.filename}</p>
                    <div className="mt-1 flex items-center gap-[5px]">
                      <StatusDot status={statusDotState(state)} />
                      <Badge variant={STATE_BADGE[state] ?? "default"}>{stateLabel(state)}</Badge>
                      <span className="font-mono text-[10px] text-[var(--muted)]">
                        {formatFileSize(item.size)}
                      </span>
                      {result?.engine_used ? (
                        <span className="font-mono text-[10px] text-[var(--muted)]">{result.engine_used}</span>
                      ) : null}
                    </div>
                    {result?.error_message ? (
                      <p className="mt-1 truncate text-[10px] text-red-400">{result.error_message}</p>
                    ) : outputFilename ? (
                      <p className="mt-1 truncate text-[10px] text-indigo-300/85">Output: {outputFilename}</p>
                    ) : state === "queued" ? (
                      <p className="mt-1 truncate text-[10px] text-[var(--muted)]">Waiting for the next batch run</p>
                    ) : state === "processing" ? (
                      <p className="mt-1 truncate text-[10px] text-indigo-300/80">Model is running on this file now</p>
                    ) : null}
                    {state !== "done" ? (
                      <ProgressBar value={stateProgress(state)} state={state as any} className="mt-[5px]" />
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Download output"
                      disabled={!outputThumbSrc}
                      onClick={() => onDownloadItem?.(item)}
                      className="border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06]"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Re-run"
                      disabled={!canEdit}
                      onClick={() => onRerun(item)}
                      className="border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06]"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Refine"
                      disabled={!canEdit}
                      onClick={() => onSelectRefine(item)}
                      className="border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06]"
                    >
                      <Brush className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Remove"
                      onClick={() => onRemove(item.upload_id)}
                      className="border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          <button
            type="button"
            onClick={onChooseFiles}
            className="group/drop relative mt-[3px] flex w-full items-center justify-center gap-[9px] overflow-hidden rounded-[10px] border border-dashed border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.012))] px-4 py-[18px] text-[12px] text-[var(--muted)] transition-all duration-150 hover:border-indigo-400/35 hover:bg-[var(--accent-lo)] hover:text-[var(--text-2)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_28px_rgba(49,46,129,0.12)]"
          >
            <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition-opacity group-hover/drop:opacity-100" />
            <ImageUp className="h-[15px] w-[15px]" />
            <span>Drop images or</span>
            <span className="text-indigo-300">browse files</span>
          </button>
        </div>
      </div>

      {compareItem ? (
        <CompareModal
          item={compareItem}
          result={getResult(compareItem)}
          onClose={() => setCompareItem(null)}
        />
      ) : null}
    </>
  );
}
