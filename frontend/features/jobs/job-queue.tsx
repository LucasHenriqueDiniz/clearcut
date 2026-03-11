"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Brush, CheckCircle2, ClipboardPaste, Download, FolderOpen, ImageUp, RotateCcw, Sparkles, Square, Trash2 } from "lucide-react";
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

function OverlapThumbs({ items }: { items: Array<Pick<UploadItem, "upload_id" | "preview_url" | "filename">> }) {
  return (
    <div className="flex items-center">
      {items.map((item, index) => (
        <div
          key={item.upload_id}
          className={cn(
            "relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-[8px] border border-white/[0.12] bg-[#18181d] shadow-[0_10px_22px_rgba(0,0,0,0.25)]",
            index > 0 && "-ml-3",
          )}
        >
          {item.preview_url ? (
            <img src={item.preview_url} alt={item.filename} className="h-full w-full object-cover" />
          ) : (
            <span className="text-[9px] font-medium text-zinc-500">{item.filename.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
      ))}
    </div>
  );
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
  const isWarmupState = Boolean(uploading || engineStarting);
  const doneCount = currentJob?.files.filter((file) => file.state === "done").length ?? 0;
  const showCompletionCard = currentJob?.state === "done" && doneCount > 0;
  const previewItems = uploads.slice(0, 10);

  const getResult = (item: UploadItem) => resultByInput[item.path];
  const outputUrl = (result?: JobFileResult) =>
    result?.output_path
      ? `${outputBaseUrl}/jobs/download?path=${encodeURIComponent(result.output_path)}`
      : undefined;

  if (!uploads.length) {
    return (
      <div className={cn("flex h-full min-h-0 flex-col bg-[var(--bg)]", className)}>
        <div className="relative flex flex-1 flex-col items-center justify-start overflow-hidden px-6 pb-6 pt-4 text-center">
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
          <div className="drop-card-border relative z-10 w-full max-w-[440px] backdrop-blur-xl shadow-[0_32px_96px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.03)]">
            <span className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <div className="pointer-events-none absolute -top-20 left-1/2 h-32 w-48 -translate-x-1/2 rounded-full bg-indigo-500/20 blur-3xl" />

            <div className="relative px-8 py-7">
              <div className="mx-auto flex h-[60px] w-[60px] items-center justify-center rounded-[18px] border border-white/[0.08] bg-[#16161a] text-indigo-300 shadow-[0_0_0_1px_rgba(99,102,241,0.15),0_20px_48px_rgba(79,70,229,0.22),inset_0_1px_0_rgba(255,255,255,0.06)]">
                <ImageUp className="h-[26px] w-[26px]" strokeWidth={1.6} />
              </div>

              <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-500">Queue</p>
              <p className="mt-1.5 text-[22px] font-semibold tracking-[-0.025em] text-[var(--text)]">Drop images anywhere</p>
              <p className="mx-auto mt-2 max-w-xs text-[12px] leading-[1.65] text-[var(--muted)]">PNG · JPG · WEBP · BMP · GIF · TIFF · HEIC · AVIF</p>

              {uploading ? (
                <div className="mx-auto mt-4 flex w-full items-center gap-3 rounded-[11px] border border-white/[0.09] bg-black/25 px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200" />
                  <div>
                    <p className="text-[12px] font-medium text-[var(--text)]">Uploading files...</p>
                    <p className="text-[11px] text-[var(--muted)]">You can keep dropping more files.</p>
                  </div>
                </div>
              ) : null}

              {engineStarting ? (
                <div className="mx-auto mt-2.5 flex w-full items-center gap-3 rounded-[11px] border border-indigo-400/20 bg-indigo-500/[0.08] px-4 py-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200" />
                  <div>
                    <p className="text-[12px] font-medium text-zinc-100">Engine starting</p>
                    <p className="text-[11px] text-zinc-400">Preparing local model for first run.</p>
                  </div>
                </div>
              ) : null}

              <div className="mt-5 flex flex-wrap justify-center gap-2">
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

              <p className="mt-4 text-[11px] text-zinc-600">Folders and repeated drops stay in the same queue.</p>
            </div>
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
          {isWarmupState ? (
            <div className="mb-2 rounded-[12px] border border-indigo-400/20 bg-[linear-gradient(180deg,rgba(79,70,229,0.12),rgba(255,255,255,0.03))] px-3.5 py-3 shadow-[0_14px_34px_rgba(49,46,129,0.18),inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200" />
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-zinc-100">{engineStarting ? "Engine is loading" : "Files are being uploaded"}</p>
                  <p className="mt-1 text-[11px] leading-5 text-zinc-400">
                    Keep dropping files if you want. The queue is collecting inputs and processing will begin when initialization completes.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {showCompletionCard ? (
            <div className="mb-2 overflow-hidden rounded-[12px] border border-emerald-400/20 bg-[linear-gradient(180deg,rgba(16,185,129,0.12),rgba(255,255,255,0.02))] px-3.5 py-3 shadow-[0_14px_34px_rgba(6,95,70,0.2),inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] border border-emerald-400/25 bg-emerald-500/12 text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-zinc-100">Batch finished successfully</p>
                  <p className="mt-1 text-[11px] leading-5 text-zinc-400">
                    {doneCount} file{doneCount === 1 ? "" : "s"} ready. Save all outputs or download a ZIP package.
                  </p>
                  <div className="mt-2.5 flex items-center gap-3">
                    <OverlapThumbs items={previewItems} />
                    {uploads.length > previewItems.length ? (
                      <span className="font-mono text-[10px] text-zinc-500">+{uploads.length - previewItems.length}</span>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={onSaveAll}>
                      <FolderOpen className="h-3 w-3" />
                      Save all
                    </Button>
                    <Button variant="success" size="sm" onClick={onDownloadZip}>
                      <Download className="h-3 w-3" />
                      Download ZIP
                    </Button>
                    <Button variant="ghost" size="sm" onClick={onChooseFiles}>
                      <Sparkles className="h-3 w-3" />
                      Add more files
                    </Button>
                  </div>
                </div>
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
