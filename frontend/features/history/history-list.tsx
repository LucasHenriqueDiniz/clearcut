"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, FolderSearch, History, ImageOff, RefreshCw, Trash2, XCircle } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
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
  if (group === "Today") return created.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return created.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
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
      parsed.background_mode === "transparent" ? "TRANSPARENT" : parsed.background_mode?.toUpperCase(),
      parsed.local_model ? parsed.local_model.toUpperCase() : null,
    ].filter(Boolean) as string[];
  } catch {
    return [];
  }
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
        "group flex items-start gap-3 rounded-[12px] border border-white/[0.06] bg-[var(--panel)] px-3.5 py-3 transition-colors hover:border-white/[0.1] hover:bg-[#1a1a1f]",
        !item.success && "border-red-500/10 bg-red-500/[0.03]",
      )}
    >
      {/* Status icon */}
      <div
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px]",
          item.success
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-red-500/10 text-red-400",
        )}
      >
        {item.success
          ? <CheckCircle2 className="h-3.5 w-3.5" />
          : <XCircle className="h-3.5 w-3.5" />}
      </div>

      <div className="flex h-[56px] w-[56px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-white/[0.08] bg-black/40">
        {outputSrc && !thumbFailed ? (
          <img
            src={outputSrc}
            alt={item.output_filename ? `${item.output_filename} preview` : "Output preview"}
            className="h-full w-full object-cover"
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-zinc-500">
            <ImageOff className="h-4 w-4" />
            <span className="text-[9px] uppercase tracking-[0.2em]">No preview</span>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="min-w-0 flex-1 space-y-1.5">
        {/* Filename + time */}
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-[12px] font-semibold text-zinc-100">{item.original_filename}</p>
          <span className="shrink-0 font-mono text-[10px] text-zinc-600">{timeLabel(item.created_at)}</span>
        </div>

        {/* Output path */}
        <p className="truncate text-[11px] text-zinc-500">
          {item.output_filename ? `→ ${item.output_filename}` : "No output generated"}
        </p>

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          {item.engine_used && <Badge variant="secondary">{item.engine_used}</Badge>}
          {item.provider_used && <Badge variant="outline">{item.provider_used}</Badge>}
          {optionBadges.map((v) => (
            <Badge key={v} variant="outline">{v}</Badge>
          ))}
        </div>

        {/* Error message */}
        {item.error_message && (
          <div className="flex items-start gap-2 rounded-[8px] border border-red-500/15 bg-red-500/[0.05] px-2.5 py-2 text-[10px] text-red-300">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="min-w-0 break-words">{item.error_message}</span>
          </div>
        )}

        {/* Actions — appear on hover */}
        <div className="flex items-center gap-1.5 pt-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="secondary"
            size="sm"
            onClick={onReveal}
            disabled={!item.output_path}
          >
            <FolderSearch className="h-3.5 w-3.5" />
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
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

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
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">

      {/* Page header */}
      <div className="flex w-full items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">History</p>
          <h2 className="mt-2 text-lg font-semibold text-zinc-100">Recent outputs</h2>
          {!loading && items.length > 0 && (
            <p className="mt-1 text-[12px] text-zinc-500">
              <span className="text-emerald-400">{successCount}</span> done
              {errorCount > 0 && <> · <span className="text-red-400">{errorCount}</span> failed</>}
            </p>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Load error */}
      {error && (
        <div className="flex w-full items-start gap-2 rounded-[10px] border border-red-500/20 bg-red-500/8 px-3 py-2.5 text-[12px] text-red-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Skeletons */}
      {loading && (
        <div className="flex w-full flex-col gap-1.5">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[88px] w-full rounded-[12px]" />)}
        </div>
      )}

      {/* Empty state */}
      {!loading && !groups.length && (
        <Card className="w-full items-center gap-3 px-6 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-[12px] border border-indigo-400/15 bg-indigo-500/10 text-indigo-300">
            <History className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-zinc-100">No history yet</p>
            <p className="mt-1 text-[12px] text-zinc-500">Processed outputs will appear here once a batch completes.</p>
          </div>
        </Card>
      )}

      {/* Groups */}
      {!loading && groups.map(([label, group]) => (
        <div key={label} className="flex w-full flex-col gap-1">
          {/* Group label */}
          <div className="mb-1 flex items-center gap-2 px-0.5">
            <Clock className="h-3 w-3 text-zinc-600" />
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-zinc-600">{label}</p>
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
      ))}
    </div>
  );
}
