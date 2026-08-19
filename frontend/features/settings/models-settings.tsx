"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Cpu,
  Download,
  FileSearch,
  FolderOpen,
  ImageUp,
  RefreshCw,
  ScanSearch,
  TestTubeDiagonal,
  Trash2,
  X,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui";
import {
  deleteModel,
  getModelBenchmarkStatus,
  getModelStorageConfig,
  installModel,
  listModelCatalog,
  refreshModelCatalog,
  revealInFolder,
  runModelBenchmark,
  updateModelStorageConfig,
} from "@/services/api";
import { getDesktopPreviewSrc, pickDirectoryPath, saveTextFileDesktop, useIsTauri } from "@/lib/platform";
import { cn } from "@/lib/utils";
import type {
  ModelBenchmarkResult,
  ModelBenchmarkStatus,
  ModelCatalogItem,
  ModelStorageConfig,
} from "@/types";

type MigrationMode = "move" | "delete" | "ignore";

const taskMeta = {
  cutout: {
    label: "Cutout",
    description: "Background removal models. Active and selectable in Workspace today.",
    icon: Cpu,
    accent: "text-sky-400",
    accentBg: "border-sky-500/20 bg-sky-500/[0.08]",
    live: true,
  },
  enhance: {
    label: "Enhance",
    description: "Local enhancement and upscale runtimes. Runtime coming soon.",
    icon: ImageUp,
    accent: "text-violet-400",
    accentBg: "border-violet-500/20 bg-violet-500/[0.08]",
    live: false,
  },
  tagging: {
    label: "Tagging",
    description: "Local tagging and routing helpers. Runtime coming soon.",
    icon: ScanSearch,
    accent: "text-amber-400",
    accentBg: "border-amber-500/20 bg-amber-500/[0.08]",
    live: false,
  },
  ocr: {
    label: "Naming / OCR",
    description: "OCR runtimes for auto-naming and automation. Runtime coming soon.",
    icon: FileSearch,
    accent: "text-emerald-400",
    accentBg: "border-emerald-500/20 bg-emerald-500/[0.08]",
    live: false,
  },
} as const;

function formatSeconds(ms?: number | null): string {
  if (ms == null) return "—";
  return `${(ms / 1000).toFixed(ms >= 10_000 ? 1 : 2)}s`;
}

function formatElapsedSince(startedAt?: string | null): string | null {
  if (!startedAt) return null;
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return null;
  return formatSeconds(Math.max(0, Date.now() - started));
}

// ─── Stat pill ─────────────────────────────────────────────────────────────────
function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1 rounded-[10px] border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-600">{label}</p>
      <p className="font-mono text-[18px] font-semibold text-zinc-100">{value}</p>
    </div>
  );
}

// ─── Compare slider ─────────────────────────────────────────────────────────────
function CompareSlider({ beforeSrc, afterSrc }: { beforeSrc: string | null; afterSrc: string | null }) {
  const [value, setValue] = useState(50);

  if (!beforeSrc || !afterSrc) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-[12px] border border-white/[0.06] bg-[#0a0a0d] text-[11px] text-zinc-600">
        Preview unavailable
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="relative h-[300px] overflow-hidden rounded-[12px] border border-white/[0.06] bg-[#0a0a0d]">
        <img
          src={beforeSrc}
          alt="Before"
          className="absolute inset-0 h-full w-full object-contain"
          style={{ clipPath: `inset(0 0 0 ${value}%)` }}
        />
        <img
          src={afterSrc}
          alt="After"
          className="absolute inset-0 h-full w-full object-contain"
          style={{ clipPath: `inset(0 ${100 - value}% 0 0)` }}
        />
        <div className="pointer-events-none absolute inset-y-0" style={{ left: `${value}%` }}>
          <div className="absolute inset-y-0 -ml-px w-0.5 bg-white/80 shadow-[0_0_12px_rgba(255,255,255,0.3)]" />
          <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full border border-white/30 bg-black/40 backdrop-blur-sm">
            <div className="h-3 w-3 rounded-full bg-white/80" />
          </div>
        </div>
        <span className="absolute left-2 top-2 rounded-[5px] border border-white/[0.1] bg-black/50 px-1.5 py-1 text-[9px] font-medium uppercase tracking-wide text-zinc-300 backdrop-blur-sm">
          Original
        </span>
        <span className="absolute right-2 top-2 rounded-[5px] border border-white/[0.1] bg-black/50 px-1.5 py-1 text-[9px] font-medium uppercase tracking-wide text-zinc-300 backdrop-blur-sm">
          Output
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="w-full accent-indigo-400"
      />
    </div>
  );
}

// ─── Storage migration modal ────────────────────────────────────────────────────
function StorageMigrationModal({
  open, currentRoot, nextRoot, onClose, onChoose,
}: {
  open: boolean;
  currentRoot: string;
  nextRoot: string;
  onClose: () => void;
  onChoose: (mode: MigrationMode) => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] rounded-[18px] border border-white/[0.08] bg-[#0f0f12] shadow-[0_40px_120px_rgba(0,0,0,0.75)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-white/[0.07] px-5 py-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-600">Storage migration</p>
          <h3 className="mt-1.5 text-[14px] font-semibold text-zinc-100">What to do with existing model files?</h3>
          <div className="mt-2 space-y-1 text-[11px] text-zinc-500">
            <p>From: <span className="font-mono text-zinc-400 break-all">{currentRoot}</span></p>
            <p>To: <span className="font-mono text-zinc-400 break-all">{nextRoot}</span></p>
          </div>
        </div>
        <div className="space-y-2 px-5 py-4">
          {[
            { mode: "move" as const, title: "Move files to new folder", hint: "Transfers known model files into the new location.", danger: false },
            { mode: "delete" as const, title: "Delete files from current folder", hint: "Removes model files from the old location. Start fresh.", danger: true },
            { mode: "ignore" as const, title: "Leave them as-is", hint: "Old files stay where they are. New folder is treated as empty.", danger: false },
          ].map(({ mode, title, hint, danger }) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChoose(mode)}
              className={cn(
                "w-full rounded-[11px] border px-4 py-3 text-left transition-colors",
                danger
                  ? "border-red-500/15 bg-red-500/[0.04] hover:bg-red-500/[0.08]"
                  : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05]",
              )}
            >
              <p className={cn("text-[12px] font-medium", danger ? "text-red-200" : "text-zinc-100")}>{title}</p>
              <p className={cn("mt-0.5 text-[10px] leading-[1.5]", danger ? "text-red-300/70" : "text-zinc-500")}>{hint}</p>
            </button>
          ))}
        </div>
        <div className="flex justify-end border-t border-white/[0.07] px-5 py-3.5">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Benchmark details modal ────────────────────────────────────────────────────
function BenchmarkDetailsModal({ result, onClose }: { result: ModelBenchmarkResult | null; onClose: () => void }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [beforeSrc, setBeforeSrc] = useState<string | null>(null);
  const [afterSrc, setAfterSrc] = useState<string | null>(null);

  useEffect(() => { setSelectedIndex(0); }, [result?.model_id]);

  const selectedImage = result?.images[selectedIndex] ?? null;

  useEffect(() => {
    let active = true;
    async function load() {
      if (!selectedImage) { setBeforeSrc(null); setAfterSrc(null); return; }
      const [before, after] = await Promise.all([
        getDesktopPreviewSrc(selectedImage.input_path),
        selectedImage.output_path ? getDesktopPreviewSrc(selectedImage.output_path) : Promise.resolve(""),
      ]);
      if (!active) return;
      setBeforeSrc(before || null);
      setAfterSrc(after || null);
    }
    void load();
    return () => { active = false; };
  }, [selectedImage]);

  if (!result) return null;

  const passRate = result.total_images > 0
    ? Math.round((result.passed_images / result.total_images) * 100)
    : 0;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm">
      <div className="flex h-[min(88vh,840px)] w-[min(1100px,100%)] flex-col overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#0f0f12] shadow-[0_40px_120px_rgba(0,0,0,0.75)]">

        {/* Modal header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-4">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-600">Benchmark details</p>
            <h3 className="mt-1.5 text-[14px] font-semibold text-zinc-100">{result.model_name}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] text-zinc-500">
              <span>
                <span className="font-mono text-[13px] font-bold text-zinc-200">{result.score}</span>
                {" "}score
              </span>
              <span>{result.passed_images}/{result.total_images} passed ({passRate}%)</span>
              <span>{formatSeconds(result.average_elapsed_ms)} avg</span>
              {result.quality_preset ? <span>preset {result.quality_preset}</span> : null}
            </div>
            {result.runtime_config ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(result.runtime_config).map(([key, value]) => (
                  <span
                    key={key}
                    className="rounded-[5px] border border-white/[0.07] bg-white/[0.03] px-1.5 py-1 font-mono text-[9px] text-zinc-500"
                  >
                    {key}={String(value)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
            Close
          </Button>
        </div>

        {/* Modal body */}
        <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)]">

          {/* Image list */}
          <div className="min-h-0 overflow-y-auto border-r border-white/[0.07] bg-[#0a0a0d] p-2.5">
            <div className="space-y-1.5">
              {result.images.map((image, index) => (
                <button
                  key={`${result.model_id}-${image.image_name}`}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className={cn(
                    "w-full rounded-[9px] border px-3 py-2.5 text-left transition-colors",
                    selectedIndex === index
                      ? "border-indigo-400/25 bg-indigo-500/[0.09]"
                      : "border-white/[0.05] hover:border-white/[0.08] hover:bg-white/[0.025]",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[11px] font-medium text-zinc-200">{image.image_name}</p>
                    <span className={cn(
                      "shrink-0 rounded-[4px] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide",
                      image.passed ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400",
                    )}>
                      {image.passed ? "Pass" : "Flag"}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-zinc-600">
                    <span>{formatSeconds(image.elapsed_ms)}</span>
                    {image.alpha_ratio != null ? <span>α {image.alpha_ratio}</span> : null}
                    {image.bbox_ratio != null ? <span>bbox {image.bbox_ratio}</span> : null}
                  </div>
                  {image.error_message ? (
                    <p className="mt-1 truncate text-[10px] text-red-400">{image.error_message}</p>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="min-h-0 overflow-y-auto p-5">
            {selectedImage ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-medium text-zinc-100">{selectedImage.image_name}</p>
                    <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-zinc-500">
                      <span>{formatSeconds(selectedImage.elapsed_ms)}</span>
                      {selectedImage.alpha_ratio != null && <span>alpha {selectedImage.alpha_ratio}</span>}
                      {selectedImage.bbox_ratio != null && <span>bbox {selectedImage.bbox_ratio}</span>}
                    </div>
                  </div>
                  {selectedImage.output_path ? (
                    <Button variant="secondary" size="sm" onClick={() => void revealInFolder(selectedImage.output_path ?? "")}>
                      <FolderOpen className="h-3 w-3" />
                      Reveal
                    </Button>
                  ) : null}
                </div>
                <CompareSlider beforeSrc={beforeSrc} afterSrc={afterSrc} />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-[11px] text-zinc-600">
                Select an image from the list
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Model row ──────────────────────────────────────────────────────────────────
function ModelRow({
  model, benchmarkSummary, busy, benchmarkBusy, rank, benchmarkState, isCurrentBenchmarkModel,
  onInstall, onDelete, onBenchmark, onOpenDetails,
}: {
  model: ModelCatalogItem;
  benchmarkSummary?: ModelBenchmarkResult;
  busy: boolean;
  benchmarkBusy: boolean;
  rank?: number;
  benchmarkState?: "queued" | "running" | "done" | "failed";
  isCurrentBenchmarkModel: boolean;
  onInstall: () => void;
  onDelete: () => void;
  onBenchmark?: () => void;
  onOpenDetails?: () => void;
}) {
  const isDownloading = model.install_state === "downloading";
  const isFailed = model.install_state === "failed";
  const isTop = rank === 1;

  return (
    <div className={cn(
      "rounded-[12px] border transition-colors",
      isCurrentBenchmarkModel && "border-indigo-400/35 bg-indigo-500/[0.06] shadow-[0_0_0_1px_rgba(99,102,241,0.18)]",
      model.installed
        ? isCurrentBenchmarkModel
          ? ""
          : isTop
          ? "border-emerald-500/15 bg-emerald-500/[0.03]"
          : "border-white/[0.08] bg-white/[0.02]"
        : "border-white/[0.04] bg-transparent",
    )}>
      <div className="flex items-start gap-3 px-4 py-3.5">

        {/* State icon */}
        <div className="mt-0.5 shrink-0">
          {model.installed
            ? <CheckCircle2 className={cn("h-4 w-4", isTop ? "text-emerald-300" : "text-emerald-500")} />
            : isFailed
              ? <XCircle className="h-4 w-4 text-red-400" />
              : <div className="h-4 w-4 rounded-full border-2 border-white/[0.1]" />
          }
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {benchmarkState ? (
              <span
                className={cn(
                  "rounded-[4px] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                  benchmarkState === "running" && "bg-indigo-500/12 text-indigo-300",
                  benchmarkState === "queued" && "bg-amber-500/10 text-amber-300",
                  benchmarkState === "done" && "bg-emerald-500/10 text-emerald-400",
                  benchmarkState === "failed" && "bg-red-500/10 text-red-400",
                )}
              >
                {benchmarkState}
              </span>
            ) : null}
            {rank != null && (
              isTop ? (
                <span className="rounded-[4px] bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-400">
                  Top
                </span>
              ) : (
                <span className="rounded-[4px] border border-white/[0.07] px-1.5 py-0.5 font-mono text-[9px] text-zinc-600">
                  #{rank}
                </span>
              )
            )}
            <p className="font-mono text-[12px] font-semibold text-zinc-100">{model.name}</p>
            {model.included_by_default ? (
              <span className="rounded-[4px] border border-sky-500/20 bg-sky-500/[0.08] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-sky-400">
                Bundled
              </span>
            ) : null}
            {!model.runtime_ready ? (
              <span className="rounded-[4px] border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-zinc-600">
                Planned
              </span>
            ) : null}
            {benchmarkSummary ? (
              <button
                type="button"
                onClick={onOpenDetails}
                className="rounded-[4px] border border-indigo-500/20 bg-indigo-500/[0.07] px-1.5 py-0.5 text-[9px] font-medium text-indigo-300 transition-colors hover:bg-indigo-500/[0.13]"
              >
                score {benchmarkSummary.score} · {formatSeconds(benchmarkSummary.average_elapsed_ms)}
              </button>
            ) : null}
          </div>

          <p className="text-[11px] leading-[1.5] text-zinc-500">{model.description}</p>

          {isDownloading ? (
            <div className="space-y-1 pt-0.5">
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-indigo-400" />
              </div>
              <p className="text-[10px] text-zinc-600">Preparing local asset…</p>
            </div>
          ) : null}

          {benchmarkSummary?.notes.slice(0, 2).map((note) => (
            <p key={note} className="text-[10px] text-amber-400">{note}</p>
          ))}
          {isCurrentBenchmarkModel ? (
            <p className="text-[10px] text-indigo-300">Currently processing this model.</p>
          ) : null}
          {model.last_error ? <p className="text-[10px] text-red-400">{model.last_error}</p> : null}
          {model.status_note && !model.last_error ? <p className="text-[10px] text-zinc-600">{model.status_note}</p> : null}
        </div>

        {/* Meta + actions */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="text-right text-[10px] text-zinc-600">
            <p className="font-mono">{model.engine}</p>
            <p>{model.size_mb} MB</p>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            {model.installable && !model.installed && !isDownloading ? (
              <Button variant="secondary" size="sm" disabled={busy} onClick={onInstall}>
                <Download className="h-3 w-3" />
                Install
              </Button>
            ) : null}
            {isDownloading ? (
              <Button variant="ghost" size="sm" disabled>
                <RefreshCw className="h-3 w-3 animate-spin" />
                Installing
              </Button>
            ) : null}
            {model.installed && model.installable ? (
              <>
                {onBenchmark ? (
                  <Button variant="secondary" size="sm" disabled={benchmarkBusy} onClick={onBenchmark}>
                    <TestTubeDiagonal className="h-3 w-3" />
                    Test
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" disabled={busy || benchmarkBusy} onClick={onDelete}>
                  <Trash2 className="h-3 w-3" />
                  Remove
                </Button>
              </>
            ) : null}
            {!model.installable ? <span className="text-[10px] text-zinc-600">Unavailable</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Benchmark panel ────────────────────────────────────────────────────────────
function BenchmarkPanel({
  benchmarkStatus, installedCount, onRunAll, onOpenDetails, onSaveReport,
}: {
  benchmarkStatus: ModelBenchmarkStatus | null;
  installedCount: number;
  onRunAll: () => void;
  onOpenDetails: (result: ModelBenchmarkResult) => void;
  onSaveReport: () => void;
}) {
  const isRunning = benchmarkStatus?.state === "running";
  const hasFailed = benchmarkStatus?.state === "failed";

  const benchmarkProgress = benchmarkStatus?.total_models
    ? Math.round((benchmarkStatus.completed_models / benchmarkStatus.total_models) * 100)
    : 0;
  const imageProgress = benchmarkStatus?.total_images
    ? Math.round((benchmarkStatus.completed_images / benchmarkStatus.total_images) * 100)
    : 0;
  const elapsed = formatElapsedSince(benchmarkStatus?.current_model_started_at);
  const statusLabel = isRunning
    ? "Running benchmark"
    : hasFailed
      ? "Benchmark failed"
      : benchmarkStatus?.report
        ? "Benchmark complete"
        : "Benchmark idle";

  return (
    <div className="rounded-[14px] border border-white/[0.08] bg-white/[0.02]">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-4 py-3.5">
        <div>
          <div className="flex items-center gap-2">
            <TestTubeDiagonal className="h-3.5 w-3.5 text-indigo-400" />
            <p className="text-[12px] font-semibold text-zinc-100">Benchmark</p>
            <span
              className={cn(
                "rounded-[4px] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                isRunning && "bg-indigo-500/12 text-indigo-300",
                hasFailed && "bg-red-500/10 text-red-300",
                !isRunning && !hasFailed && benchmarkStatus?.report && "bg-emerald-500/10 text-emerald-400",
                !benchmarkStatus?.report && !isRunning && !hasFailed && "bg-white/[0.05] text-zinc-500",
              )}
            >
              {statusLabel}
            </span>
            {benchmarkStatus?.report ? (
              <span className="text-[10px] text-zinc-600">
                · last run {new Date(benchmarkStatus.report.generated_at).toLocaleString()}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[10px] leading-[1.55] text-zinc-600">
            Runs installed cutout models against <span className="font-mono text-zinc-500">sample-images</span> and scores them side-by-side.
          </p>
          {benchmarkStatus?.log_path ? (
            <p className="mt-1 text-[10px] text-zinc-600">
              log <span className="font-mono text-zinc-500">{benchmarkStatus.log_path}</span>
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {benchmarkStatus?.report ? (
            <Button variant="ghost" size="sm" onClick={onSaveReport}>
              <Download className="h-3 w-3" />
              Save report
            </Button>
          ) : null}
          {benchmarkStatus?.report?.results?.[0]?.preview_path ? (
            <Button variant="ghost" size="sm" onClick={() => void revealInFolder(benchmarkStatus.report?.results?.[0]?.preview_path ?? "")}>
              <FolderOpen className="h-3 w-3" />
              Outputs
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" disabled={isRunning || installedCount === 0} onClick={onRunAll}>
            <TestTubeDiagonal className="h-3 w-3" />
            {isRunning ? "Running…" : "Run all tests"}
          </Button>
        </div>
      </div>

      {/* Running progress */}
      {isRunning ? (
        <div className="border-b border-white/[0.06] bg-[linear-gradient(180deg,rgba(99,102,241,0.09),rgba(99,102,241,0.03))] px-4 py-3.5">
          <div className="flex items-start justify-between gap-3 text-[11px]">
            <div>
              <p className="font-medium text-indigo-100">
                Current model: {benchmarkStatus?.current_model_name ?? "model"}
              </p>
              <p className="mt-0.5 text-[10px] text-indigo-300/80">
                Current image: {benchmarkStatus?.current_image_name ?? "waiting for first image"}
              </p>
            </div>
            <span className="rounded-[6px] border border-indigo-400/20 bg-indigo-500/[0.12] px-2 py-1 font-mono text-indigo-200">
              {benchmarkProgress}%{elapsed ? ` · ${elapsed}` : ""}
            </span>
          </div>
          <p className="mt-2 text-[10px] text-indigo-300/70">
            model {benchmarkStatus?.completed_models}/{benchmarkStatus?.total_models}
            {" · "}image {benchmarkStatus?.completed_images}/{benchmarkStatus?.total_images}
          </p>
          <div className="mt-2.5 space-y-1.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
              <div className="h-full rounded-full bg-indigo-400 transition-all duration-300" style={{ width: `${benchmarkProgress}%` }} />
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/[0.05]">
              <div className="h-full rounded-full bg-sky-400 transition-all duration-300" style={{ width: `${imageProgress}%` }} />
            </div>
          </div>
        </div>
      ) : null}

      {/* Error */}
      {hasFailed && benchmarkStatus?.last_error ? (
        <div className="border-b border-white/[0.06] px-4 py-3 text-[11px] text-red-300">
          Benchmark failed: {benchmarkStatus.last_error}
        </div>
      ) : null}

      {/* Leaderboard */}
      {benchmarkStatus?.report ? (
        <div className="space-y-1.5 px-4 py-4">
          {benchmarkStatus.report.results.map((result, index) => {
            const passRate = result.total_images > 0
              ? Math.round((result.passed_images / result.total_images) * 100)
              : 0;
            const isTop = index === 0;

            return (
              <div
                key={result.model_id}
                className={cn(
                  "flex items-center gap-3 rounded-[10px] border px-3 py-2.5",
                  isTop ? "border-emerald-500/15 bg-emerald-500/[0.04]" : "border-white/[0.05]",
                )}
              >
                <span className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold",
                  isTop ? "bg-emerald-500/15 text-emerald-300" : "bg-white/[0.04] text-zinc-600",
                )}>
                  {index + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <p className={cn("font-mono text-[11px] font-semibold", isTop ? "text-zinc-100" : "text-zinc-300")}>
                    {result.model_name}
                  </p>
                  <div className="flex flex-wrap gap-2 text-[10px] text-zinc-600">
                    <span className={cn(isTop && "text-emerald-500")}>{passRate}% passed</span>
                    <span>{formatSeconds(result.average_elapsed_ms)}</span>
                  </div>
                </div>

                <span className={cn("font-mono text-[16px] font-bold", isTop ? "text-emerald-300" : "text-zinc-500")}>
                  {result.score}
                </span>

                <Button variant="ghost" size="sm" onClick={() => onOpenDetails(result)}>Details</Button>
              </div>
            );
          })}
        </div>
      ) : (
        !isRunning ? (
          <div className="px-4 py-4 text-[11px] text-zinc-600">
            No results yet. Install at least one cutout model and run the test.
          </div>
        ) : null
      )}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────────
export function ModelsSettings() {
  const [models, setModels] = useState<ModelCatalogItem[]>([]);
  const [benchmarkStatus, setBenchmarkStatus] = useState<ModelBenchmarkStatus | null>(null);
  const [storageConfig, setStorageConfig] = useState<ModelStorageConfig | null>(null);
  const [busyModelId, setBusyModelId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTask, setActiveTask] = useState<"cutout" | "enhance" | "tagging" | "ocr">("cutout");
  const [selectedBenchmarkResult, setSelectedBenchmarkResult] = useState<ModelBenchmarkResult | null>(null);
  const [pendingRootChange, setPendingRootChange] = useState<{ nextRoot: string; reset: boolean } | null>(null);
  const isTauri = useIsTauri();

  const reload = async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true);
    try {
      const [items, config, benchmark] = await Promise.all([
        forceRefresh ? refreshModelCatalog() : listModelCatalog(),
        getModelStorageConfig(),
        getModelBenchmarkStatus(),
      ]);
      setModels(items);
      setStorageConfig(config);
      setBenchmarkStatus(benchmark);
      setLoadError(null);
    } catch (error) {
      setLoadError(String(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void reload(true); }, []);

  const hasActiveDownload = useMemo(() => models.some((m) => m.install_state === "downloading"), [models]);

  useEffect(() => {
    if (!hasActiveDownload) return;
    const t = window.setInterval(() => void reload(), 2000);
    return () => window.clearInterval(t);
  }, [hasActiveDownload]);

  useEffect(() => {
    if (benchmarkStatus?.state !== "running") return;
    const t = window.setInterval(() => void reload(), 2500);
    return () => window.clearInterval(t);
  }, [benchmarkStatus?.state]);

  const groupedModels = useMemo(() => {
    const groups = { cutout: [] as ModelCatalogItem[], enhance: [] as ModelCatalogItem[], tagging: [] as ModelCatalogItem[], ocr: [] as ModelCatalogItem[] };
    for (const model of models) groups[model.task].push(model);
    return groups;
  }, [models]);

  const benchmarkByModelId = useMemo(() => {
    const map = new Map<string, ModelBenchmarkResult>();
    for (const item of benchmarkStatus?.report?.results ?? []) map.set(item.model_id, item);
    return map;
  }, [benchmarkStatus?.report]);

  const benchmarkRankByModelId = useMemo(() => {
    const rank = new Map<string, number>();
    benchmarkStatus?.report?.results.forEach((r, i) => rank.set(r.model_id, i + 1));
    return rank;
  }, [benchmarkStatus?.report]);

  const installedCount = models.filter((m) => m.installed).length;
  const totalCount = models.length;
  const visibleTaskModels = groupedModels[activeTask];
  const activeTaskMeta = taskMeta[activeTask];
  const ActiveTaskIcon = activeTaskMeta.icon;
  const installableVisible = visibleTaskModels.filter((m) => m.installable && !m.installed);
  const installedCutoutCount = groupedModels.cutout.filter((m) => m.installed).length;
  const benchmarkModelIds = benchmarkStatus?.report?.results.map((result) => result.model_id) ?? [];

  const applyStorageRootChange = async (nextRoot: string | null, mode: MigrationMode) => {
    setBusyModelId("storage");
    try {
      await updateModelStorageConfig(nextRoot, mode);
      await reload(true);
      setPendingRootChange(null);
    } catch (error) {
      setLoadError(String(error));
    } finally {
      setBusyModelId(null);
    }
  };

  const saveBenchmarkReport = async () => {
    const report = benchmarkStatus?.report;
    if (!report) return;

    const generatedAt = report.generated_at.replace(/[:T]/g, "-").replace(/\..+$/, "");
    const suggestedName = `clearcut-benchmark-${generatedAt}.json`;
    const content = JSON.stringify(report, null, 2);

    if (isTauri) {
      await saveTextFileDesktop(content, suggestedName, "Save benchmark report", [
        { name: "JSON", extensions: ["json"] },
      ]);
      return;
    }

    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = suggestedName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-zinc-600">Models</p>
            <h2 className="mt-1.5 text-[15px] font-semibold text-zinc-100">Local asset library</h2>
            <p className="mt-1 max-w-[520px] text-[12px] leading-[1.6] text-zinc-500">
              Install runtimes once, keep them cached, benchmark them on your own images and keep only what performs.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!loading ? (
              <span className="rounded-[7px] border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 font-mono text-[10px] text-zinc-500">
                {installedCount}/{totalCount} installed
              </span>
            ) : null}
            <Button variant="ghost" size="sm" disabled={refreshing} onClick={() => void reload(true)}>
              <RefreshCw className={cn("h-3.5 w-3.5", (loading || refreshing) && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2">
          {(["cutout", "enhance", "tagging", "ocr"] as const).map((task) => {
            const meta = taskMeta[task];
            const installed = groupedModels[task].filter((m) => m.installed).length;
            const total = groupedModels[task].length;
            return <StatPill key={task} label={meta.label} value={`${installed}/${total}`} />;
          })}
        </div>

        {/* Storage */}
        <div className="rounded-[12px] border border-white/[0.07] bg-white/[0.02] px-4 py-3.5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-600">Storage</p>
              <p className="mt-1.5 break-all font-mono text-[11px] text-zinc-400">
                {storageConfig?.root_dir ?? "Loading…"}
              </p>
              <p className="mt-0.5 text-[10px] text-zinc-600">
                {storageConfig?.using_custom_root ? "Custom location" : "Default app location"} · change only to keep large files elsewhere
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                disabled={!isTauri || hasActiveDownload || benchmarkStatus?.state === "running"}
                onClick={async () => {
                  const path = await pickDirectoryPath();
                  if (!path || path === storageConfig?.root_dir) return;
                  setPendingRootChange({ nextRoot: path, reset: false });
                }}
              >
                <FolderOpen className="h-3 w-3" />
                Change
              </Button>
              {storageConfig?.using_custom_root ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={hasActiveDownload || benchmarkStatus?.state === "running"}
                  onClick={() => {
                    const defaultRoot = storageConfig?.default_root_dir ?? "";
                    if (storageConfig?.root_dir === defaultRoot) return;
                    setPendingRootChange({ nextRoot: defaultRoot, reset: true });
                  }}
                >
                  <X className="h-3 w-3" />
                  Reset
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {/* Task tabs */}
        <div className="rounded-[12px] border border-white/[0.07] bg-[#0a0a0d] p-1">
          <div className="grid grid-cols-4 gap-1">
            {(["cutout", "enhance", "tagging", "ocr"] as const).map((task) => {
              const meta = taskMeta[task];
              const Icon = meta.icon;
              const isActive = activeTask === task;
              const installed = groupedModels[task].filter((m) => m.installed).length;
              const total = groupedModels[task].length;
              return (
                <button
                  key={task}
                  type="button"
                  onClick={() => setActiveTask(task)}
                  className={cn(
                    "flex flex-col items-start gap-1.5 rounded-[9px] border px-3 py-2.5 text-left transition-colors",
                    isActive ? "border-white/[0.09] bg-white/[0.05]" : "border-transparent hover:bg-white/[0.03]",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <Icon className={cn("h-3.5 w-3.5 transition-colors", isActive ? meta.accent : "text-zinc-600")} />
                    <span className={cn("text-[11px] font-medium transition-colors", isActive ? "text-zinc-100" : "text-zinc-500")}>
                      {meta.label}
                    </span>
                    {meta.live ? (
                      <span className="rounded-[3px] bg-emerald-500/10 px-1 text-[8px] font-semibold uppercase text-emerald-500">
                        Live
                      </span>
                    ) : null}
                  </div>
                  <span className={cn("font-mono text-[10px]", isActive ? "text-zinc-400" : "text-zinc-700")}>
                    {installed}/{total}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Error */}
        {loadError ? (
          <div className="rounded-[10px] border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-[11px] text-red-300">
            Could not load the model catalog. {loadError}
          </div>
        ) : null}

        {/* Task section */}
        <section className="space-y-3">

          {/* Task header */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className={cn("flex h-6 w-6 items-center justify-center rounded-[7px] border", activeTaskMeta.accentBg)}>
                <ActiveTaskIcon className={cn("h-3.5 w-3.5", activeTaskMeta.accent)} />
              </div>
              <div>
                <p className="text-[12px] font-semibold text-zinc-200">{activeTaskMeta.label}</p>
                <p className="text-[10px] text-zinc-600">{activeTaskMeta.description}</p>
              </div>
            </div>
            {!activeTaskMeta.live ? (
              <span className="rounded-[5px] border border-white/[0.07] px-2 py-0.5 text-[9px] uppercase tracking-wide text-zinc-600">
                Planned
              </span>
            ) : null}
          </div>

          {/* Batch install */}
          {installableVisible.length > 1 ? (
            <div className="flex items-center justify-between rounded-[10px] border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
              <div>
                <p className="text-[11px] font-medium text-zinc-200">Install all</p>
                <p className="text-[10px] text-zinc-600">{installableVisible.length} models available to download.</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={hasActiveDownload || busyModelId === "install-all" || benchmarkStatus?.state === "running"}
                onClick={async () => {
                  setBusyModelId("install-all");
                  try {
                    for (const model of installableVisible) await installModel(model.id);
                    await reload();
                  } finally {
                    setBusyModelId(null);
                  }
                }}
              >
                <Download className="h-3 w-3" />
                Install all
              </Button>
            </div>
          ) : null}

          {/* Benchmark panel — cutout only */}
          {activeTask === "cutout" ? (
            <BenchmarkPanel
              benchmarkStatus={benchmarkStatus}
              installedCount={installedCutoutCount}
              onSaveReport={() => void saveBenchmarkReport()}
              onRunAll={async () => {
                setBusyModelId("benchmark-all");
                try {
                  await reload(true);
                  const status = await runModelBenchmark({ task: "cutout" });
                  setBenchmarkStatus(status);
                } catch (error) {
                  setLoadError(String(error));
                } finally {
                  setBusyModelId(null);
                }
              }}
              onOpenDetails={setSelectedBenchmarkResult}
            />
          ) : null}

          {/* Model rows */}
          {!visibleTaskModels.length && !loading ? (
            <div className="rounded-[10px] border border-white/[0.06] px-4 py-4 text-[11px] text-zinc-600">
              No models registered for this task yet.
            </div>
          ) : null}

          <div className="space-y-2">
            {visibleTaskModels.map((model) => (
              (() => {
                let benchmarkState: "queued" | "running" | "done" | "failed" | undefined;
                const isCurrentBenchmarkModel = benchmarkStatus?.state === "running" && benchmarkStatus.current_model_id === model.id;
                if (benchmarkStatus?.state === "running") {
                  if (isCurrentBenchmarkModel) benchmarkState = "running";
                  else if (benchmarkModelIds.includes(model.id)) benchmarkState = "done";
                  else if (model.installed && activeTask === "cutout") benchmarkState = "queued";
                } else if (benchmarkStatus?.report && benchmarkByModelId.get(model.id)) {
                  benchmarkState = benchmarkByModelId.get(model.id)?.failed_images ? "failed" : "done";
                }

                return (
              <ModelRow
                key={model.id}
                model={model}
                benchmarkSummary={benchmarkByModelId.get(model.id)}
                rank={benchmarkRankByModelId.get(model.id)}
                busy={busyModelId === model.id}
                benchmarkBusy={benchmarkStatus?.state === "running"}
                benchmarkState={benchmarkState}
                isCurrentBenchmarkModel={Boolean(isCurrentBenchmarkModel)}
                onInstall={async () => {
                  setBusyModelId(model.id);
                  try { await installModel(model.id); await reload(); }
                  finally { setBusyModelId(null); }
                }}
                onDelete={async () => {
                  setBusyModelId(model.id);
                  try { await deleteModel(model.id); await reload(); }
                  finally { setBusyModelId(null); }
                }}
                onBenchmark={
                  activeTask === "cutout" && model.installed
                    ? async () => {
                        setBusyModelId(`benchmark:${model.id}`);
                        try {
                          await reload(true);
                          const status = await runModelBenchmark({ task: "cutout", model_ids: [model.id] });
                          setBenchmarkStatus(status);
                        } catch (error) {
                          setLoadError(String(error));
                        } finally {
                          setBusyModelId(null);
                        }
                      }
                    : undefined
                }
                onOpenDetails={
                  benchmarkByModelId.get(model.id)
                    ? () => setSelectedBenchmarkResult(benchmarkByModelId.get(model.id) ?? null)
                    : undefined
                }
              />
                );
              })()
            ))}
          </div>
        </section>
      </div>

      <BenchmarkDetailsModal result={selectedBenchmarkResult} onClose={() => setSelectedBenchmarkResult(null)} />
      <StorageMigrationModal
        open={Boolean(pendingRootChange && storageConfig?.root_dir)}
        currentRoot={storageConfig?.root_dir ?? ""}
        nextRoot={pendingRootChange?.nextRoot ?? ""}
        onClose={() => setPendingRootChange(null)}
        onChoose={(mode) =>
          void applyStorageRootChange(
            pendingRootChange?.reset ? null : (pendingRootChange?.nextRoot ?? null),
            mode,
          )
        }
      />
    </>
  );
}
