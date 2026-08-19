"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, FolderSearch, History, ImageOff, RefreshCw, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { deleteHistoryItem, listHistory, revealInFolder } from "@/services/api";
import type { HistoryItem, ProcessingOptions } from "@/types";
import { cn } from "@/lib/utils";
import { useBackendBaseUrl } from "@/lib/platform";

function groupLabel(date: string) {
  const created = new Date(date);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const stamp = new Date(created.getFullYear(), created.getMonth(), created.getDate()).getTime();
  if (stamp === today) return "Today";
  if (stamp === yesterday) return "Yesterday";
  return created.toLocaleDateString();
}

function timeLabel(date: string) {
  const created = new Date(date);
  const group = groupLabel(date);
  if (group === "Today")
    return created.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return created.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function groupedItems(items: HistoryItem[]) {
  const groups = new Map<string, HistoryItem[]>();
  for (const item of items) {
    const label = groupLabel(item.created_at);
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return Array.from(groups.entries());
}

function summarizeOptions(raw: string) {
  try {
    const parsed = JSON.parse(raw) as Partial<ProcessingOptions>;
    return [
      parsed.output_format ? parsed.output_format.toUpperCase() : null,
      parsed.background_mode === "transparent"
        ? "TRANSPARENT"
        : parsed.background_mode?.toUpperCase(),
      parsed.cutout_model_id
        ? parsed.cutout_model_id.toUpperCase()
        : parsed.local_model?.toUpperCase(),
    ].filter(Boolean) as string[];
  } catch {
    return [];
  }
}

// ─── Stat pill (same as other screens) ───────────────────────────────────────
function StatPill({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[10px] border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-600">{label}</p>
      <p className={cn("font-mono text-[18px] font-semibold", accent ?? "text-zinc-100")}>{value}</p>
    </div>
  );
}

// ─── Option chip ──────────────────────────────────────────────────────────────
function OptionChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[4px] border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-zinc-500">
      {children}
    </span>
  );
}

// ─── Single history row ───────────────────────────────────────────────────────
function HistoryRow({
  item,
  onReveal,
  onRemove,
  outputBaseUrl,
}: {
  item: HistoryItem;
  onReveal: () => void;
  onRemove: () => Promise<void>;
  outputBaseUrl: string;
}) {
  const optionBadges = summarizeOptions(item.processing_options);
  const [removing, setRemoving] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const outputSrc = item.output_path
    ? `${outputBaseUrl}/jobs/download?path=${encodeURIComponent(item.output_path)}`
    : "";

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-[12px] border px-3.5 py-3 transition-colors",
        item.success
          ? "border-white/[0.06] bg-white/[0.01] hover:border-white/[0.1] hover:bg-white/[0.03]"
          : "border-red-500/10 bg-red-500/[0.025]",
      )}
    >
      {/* Status icon */}
      <div
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px]",
          item.success
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-red-500/10 text-red-400",
        )}
      >
        {item.success
          ? <CheckCircle2 className="h-3.5 w-3.5" />
          : <XCircle className="h-3.5 w-3.5" />}
      </div>

      {/* Thumbnail */}
      <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-[9px] border border-white/[0.07] bg-black/30">
        {outputSrc && !thumbFailed ? (
          <img
            src={outputSrc}
            alt={item.output_filename ? `${item.output_filename} preview` : "Output preview"}
            className="h-full w-full object-cover"
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-zinc-600">
            <ImageOff className="h-3.5 w-3.5" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-[12px] font-medium text-zinc-100">{item.original_filename}</p>
          <span className="shrink-0 font-mono text-[10px] text-zinc-600">
            {timeLabel(item.created_at)}
          </span>
        </div>

        <p className="truncate text-[10px] text-zinc-600">
          {item.output_filename ? `→ ${item.output_filename}` : "No output generated"}
        </p>

        {/* Option chips */}
        {(optionBadges.length > 0 || item.engine_used || item.provider_used) ? (
          <div className="flex flex-wrap items-center gap-1">
            {item.engine_used ? <OptionChip>{item.engine_used}</OptionChip> : null}
            {item.provider_used ? <OptionChip>{item.provider_used}</OptionChip> : null}
            {optionBadges.map((v) => <OptionChip key={v}>{v}</OptionChip>)}
          </div>
        ) : null}

        {/* Error */}
        {item.error_message ? (
          <div className="flex items-start gap-1.5 rounded-[7px] border border-red-500/15 bg-red-500/[0.05] px-2 py-1.5 text-[10px] text-red-300">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="break-words">{item.error_message}</span>
          </div>
        ) : null}

        {/* Actions — on hover */}
        <div className="flex items-center gap-1.5 pt-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="secondary"
            size="sm"
            onClick={onReveal}
            disabled={!item.output_path}
          >
            <FolderSearch className="h-3 w-3" />
            Reveal
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={removing}
            onClick={async () => {
              setRemoving(true);
              await onRemove();
            }}
          >
            <Trash2 className="h-3 w-3" />
            Remove
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function HistoryList() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const outputBaseUrl = useBackendBaseUrl();

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await listHistory());
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const groups = useMemo(() => groupedItems(items), [items]);
  const successCount = items.filter((i) => i.success).length;
  const errorCount = items.filter((i) => !i.success).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-zinc-600">History</p>
          <h2 className="mt-1.5 text-[15px] font-semibold text-zinc-100">Recent outputs</h2>
          <p className="mt-1 text-[12px] text-zinc-600">
            Processed outputs from manual runs and watch folders.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void load()}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Stats — only when there's data */}
      {!loading && items.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          <StatPill label="Total" value={items.length} />
          <StatPill label="Done" value={successCount} accent="text-emerald-400" />
          <StatPill label="Failed" value={errorCount} accent={errorCount > 0 ? "text-red-400" : "text-zinc-100"} />
        </div>
      ) : null}

      {/* Load error */}
      {error ? (
        <div className="flex items-start gap-2 rounded-[10px] border border-red-500/20 bg-red-500/[0.06] px-3 py-3 text-[11px] text-red-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      ) : null}

      {/* Skeletons */}
      {loading ? (
        <div className="flex flex-col gap-1.5">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[80px] w-full rounded-[12px]" />
          ))}
        </div>
      ) : null}

      {/* Empty state */}
      {!loading && !groups.length && !error ? (
        <div className="flex flex-col items-center gap-3 rounded-[14px] border border-dashed border-white/[0.07] px-6 py-12 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-white/[0.08] bg-white/[0.03]">
            <History className="h-5 w-5 text-zinc-600" />
          </div>
          <div>
            <p className="text-[12px] font-medium text-zinc-300">No history yet</p>
            <p className="mt-1 text-[11px] text-zinc-600">
              Processed outputs appear here once a batch completes.
            </p>
          </div>
        </div>
      ) : null}

      {/* Groups */}
      {!loading
        ? groups.map(([label, group]) => (
          <div key={label} className="flex flex-col gap-1.5">
            {/* Group label */}
            <div className="flex items-center gap-1.5 px-0.5">
              <Clock className="h-3 w-3 text-zinc-700" />
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600">
                {label}
              </p>
              <span className="font-mono text-[9px] text-zinc-700">{group.length}</span>
            </div>

            {/* Rows */}
            <div className="space-y-1">
              {group.map((item) => (
                <HistoryRow
                  key={item.id}
                  item={item}
                  outputBaseUrl={outputBaseUrl}
                  onReveal={() => revealInFolder(item.output_path)}
                  onRemove={async () => {
                    await deleteHistoryItem(item.id);
                    await load();
                  }}
                />
              ))}
            </div>
          </div>
        ))
        : null}
    </div>
  );
}