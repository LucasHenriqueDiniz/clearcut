import { useEffect, useMemo, useState } from "react";
import { Activity, Clock, FolderInput, FolderOpen, PauseCircle, Pencil, PlayCircle, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui";
import { useIsTauri } from "@/lib/platform";
import { FALLBACK_PRESETS } from "@/lib/default-presets";
import {
  createWatchFolder,
  deleteWatchFolder,
  disableWatchFolder,
  enableWatchFolder,
  listPresets,
  listWatchFolders,
  updateWatchFolder,
} from "@/services/api";
import { cn } from "@/lib/utils";
import type { PresetItem, WatchFolderItem, WatchFolderPayload } from "@/types";
import { WatchFolderForm } from "./watch-folder-form";

function statusDot(status: WatchFolderItem["status"]) {
  if (status === "watching") return "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]";
  if (status === "error") return "bg-amber-400";
  if (status === "unsupported") return "bg-sky-400";
  return "bg-zinc-600";
}

function statusLabel(status: WatchFolderItem["status"]) {
  if (status === "watching") return "Watching";
  if (status === "error") return "Error";
  if (status === "unsupported") return "Unsupported";
  return "Idle";
}

// ─── Stat pill ────────────────────────────────────────────────────────────────
function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1 rounded-[10px] border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-600">{label}</p>
      <p className="font-mono text-[18px] font-semibold text-zinc-100">{value}</p>
    </div>
  );
}

// ─── Watch folder card ────────────────────────────────────────────────────────
function WatchFolderCard({
  item,
  presetNameById,
  onEdit,
  onToggle,
  onDelete,
}: {
  item: WatchFolderItem;
  presetNameById: Record<string, string>;
  onEdit: () => void;
  onToggle: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  return (
    <div
      className={cn(
        "rounded-[14px] border transition-colors",
        item.is_enabled
          ? "border-white/[0.08] bg-white/[0.02]"
          : "border-white/[0.04] bg-transparent opacity-70",
      )}
    >
      {/* ── Card header ── */}
      <div className="flex items-start gap-3 px-4 py-4">
        {/* Status dot */}
        <div className="mt-1 shrink-0">
          <div className={cn("h-2 w-2 rounded-full", statusDot(item.status))} />
        </div>

        {/* Main info */}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-[12px] font-semibold text-zinc-100">{item.name}</p>
            <span className={cn(
              "rounded-[5px] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
              item.status === "watching"
                ? "bg-emerald-500/10 text-emerald-400"
                : item.status === "error"
                  ? "bg-amber-500/10 text-amber-400"
                  : "bg-white/[0.04] text-zinc-500",
            )}>
              {statusLabel(item.status)}
            </span>
            {!item.is_enabled ? (
              <span className="rounded-[5px] bg-white/[0.03] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-600">
                Disabled
              </span>
            ) : null}
            {item.preset_missing ? (
              <span className="rounded-[5px] bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-400">
                Preset missing
              </span>
            ) : null}
            {item.auto_run ? (
              <span className="rounded-[5px] bg-sky-500/[0.08] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-400">
                Auto
              </span>
            ) : null}
          </div>

          {/* Paths */}
          <div className="grid gap-1 text-[11px] sm:grid-cols-2">
            <div className="flex items-start gap-1.5 min-w-0">
              <FolderInput className="mt-0.5 h-3 w-3 shrink-0 text-zinc-600" />
              <span className="break-all text-zinc-400">{item.input_folder}</span>
            </div>
            <div className="flex items-start gap-1.5 min-w-0">
              <FolderOpen className="mt-0.5 h-3 w-3 shrink-0 text-zinc-600" />
              <span className="break-all text-zinc-400">{item.output_folder}</span>
            </div>
          </div>

          {/* Preset + cooldown */}
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-zinc-600">
            <span>
              Preset:{" "}
              <span className="text-zinc-400">
                {presetNameById[item.preset_id] ?? item.preset_id}
              </span>
            </span>
            <span>
              Cooldown: <span className="text-zinc-400">{item.cooldown_ms} ms</span>
            </span>
            {item.skip_duplicates ? <span className="text-zinc-500">Dedup on</span> : null}
          </div>

          {item.last_error ? (
            <p className="text-[11px] text-amber-400">{item.last_error}</p>
          ) : null}
        </div>

        {/* Processed count */}
        <div className="shrink-0 text-right">
          <p className="font-mono text-[15px] font-semibold text-zinc-200">{item.files_processed_count}</p>
          <p className="text-[9px] uppercase tracking-wide text-zinc-600">processed</p>
          {item.last_processed_at ? (
            <p className="mt-1 text-[10px] text-zinc-600">
              {new Date(item.last_processed_at).toLocaleTimeString()}
            </p>
          ) : null}
        </div>
      </div>

      {/* ── Card footer ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.05] px-4 py-2.5">
        <div className="flex items-center gap-1 text-[10px] text-zinc-600">
          <Clock className="h-3 w-3" />
          {item.last_activity_at
            ? `Active ${new Date(item.last_activity_at).toLocaleString()}`
            : "No activity yet"}
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil className="h-3 w-3" />
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void onToggle()}>
            {item.is_enabled
              ? <><PauseCircle className="h-3 w-3" /> Disable</>
              : <><PlayCircle className="h-3 w-3" /> Enable</>}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void window.navigator.clipboard.writeText(item.output_folder)}
          >
            <FolderOpen className="h-3 w-3" />
            Copy output
          </Button>
          <Button variant="danger" size="sm" onClick={() => void onDelete()}>
            <Trash2 className="h-3 w-3" />
            Remove
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function WatchFoldersSettings() {
  const isTauri = useIsTauri();
  const [items, setItems] = useState<WatchFolderItem[]>([]);
  const [presets, setPresets] = useState<PresetItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<WatchFolderItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const reload = async () => {
    try {
      const [watchFolders, presetItems] = await Promise.all([listWatchFolders(), listPresets()]);
      setItems(watchFolders);
      setPresets(presetItems.length ? presetItems : FALLBACK_PRESETS);
      setLoadError(null);
    } catch (error) {
      setPresets(FALLBACK_PRESETS);
      setLoadError(String(error));
    }
  };

  useEffect(() => { void reload(); }, []);
  useEffect(() => {
    const timer = window.setInterval(() => void reload(), 2500);
    return () => window.clearInterval(timer);
  }, []);

  const presetNameById = useMemo(
    () => Object.fromEntries(presets.map((item) => [item.id, item.name])),
    [presets],
  );

  const activeCount = items.filter((item) => item.is_enabled).length;
  const watchingCount = items.filter((item) => item.status === "watching").length;
  const processedCount = items.reduce((sum, item) => sum + item.files_processed_count, 0);

  if (!isTauri) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-zinc-600">Watch Folders</p>
          <h2 className="mt-1.5 text-[15px] font-semibold text-zinc-100">Automation layer</h2>
          <p className="mt-1 max-w-[560px] text-[12px] leading-[1.6] text-zinc-500">
            Watch folders are only available in the desktop runtime because they depend on local filesystem watchers.
          </p>
        </div>
        <div className="rounded-[12px] border border-white/[0.07] px-4 py-5 text-[12px] text-zinc-500">
          Open the desktop build to register folders, attach presets and run the watcher service in the background.
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-zinc-600">Watch Folders</p>
          <h2 className="mt-1.5 text-[15px] font-semibold text-zinc-100">Automated ingest</h2>
          <p className="mt-1 max-w-[560px] text-[12px] leading-[1.6] text-zinc-500">
            Register desktop folders that auto-enqueue new files into the normal batch pipeline using a selected preset.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setEditingItem(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add folder
        </Button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-2">
        <StatPill label="Registered" value={items.length} />
        <StatPill label="Active" value={`${watchingCount}/${activeCount}`} />
        <StatPill label="Processed" value={processedCount} />
      </div>

      {/* ── Errors ── */}
      {loadError ? (
        <div className="rounded-[10px] border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-[12px] text-amber-300">
          Could not load watch folder status. {loadError}
        </div>
      ) : null}

      {/* ── Empty state ── */}
      {!loadError && !items.length ? (
        <div className="flex flex-col items-center gap-3 rounded-[14px] border border-dashed border-white/[0.08] px-6 py-10 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-white/[0.08] bg-white/[0.03]">
            <Activity className="h-5 w-5 text-zinc-500" />
          </div>
          <div>
            <p className="text-[12px] font-medium text-zinc-300">No watch folders yet</p>
            <p className="mt-1 text-[11px] text-zinc-600">
              Add a folder to start auto-ingesting files into the batch pipeline.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setEditingItem(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add first folder
          </Button>
        </div>
      ) : null}

      {/* ── Cards ── */}
      <div className="flex flex-col gap-2.5">
        {items.map((item) => (
          <WatchFolderCard
            key={item.id}
            item={item}
            presetNameById={presetNameById}
            onEdit={() => {
              setEditingItem(item);
              setFormOpen(true);
            }}
            onToggle={async () => {
              if (item.is_enabled) await disableWatchFolder(item.id);
              else await enableWatchFolder(item.id);
              await reload();
            }}
            onDelete={async () => {
              await deleteWatchFolder(item.id);
              await reload();
            }}
          />
        ))}
      </div>

      <WatchFolderForm
        open={formOpen}
        onOpenChange={setFormOpen}
        presets={presets}
        initialValue={editingItem}
        onSubmit={async (payload: WatchFolderPayload) => {
          if (editingItem) {
            await updateWatchFolder(editingItem.id, payload);
          } else {
            await createWatchFolder(payload);
          }
          await reload();
        }}
      />
    </div>
  );
}