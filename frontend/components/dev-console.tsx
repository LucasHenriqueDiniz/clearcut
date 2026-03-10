"use client";

import { useEffect, useState } from "react";
import { Bug, Copy, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui";
import { clearLogEntries, getLogEntries, subscribeLogs, type DevLogEntry } from "@/lib/dev-log";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
};

function formatTime(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function DevConsole({ open, onClose }: Props) {
  const [entries, setEntries] = useState<DevLogEntry[]>(() => getLogEntries());

  useEffect(() => {
    const unsubscribe = subscribeLogs(() => setEntries(getLogEntries()));
    return () => {
      unsubscribe();
    };
  }, []);

  if (!open) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[90] w-[520px] max-w-[90vw] overflow-hidden rounded-[12px] border border-white/[0.1] bg-[#0f0f12]/95 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl">
      <div className="flex items-center gap-2 border-b border-white/[0.08] px-3 py-2">
        <Bug className="h-4 w-4 text-indigo-300" />
        <span className="text-[12px] font-semibold text-zinc-100">Dev Console</span>
        <span className="ml-auto text-[10px] text-zinc-500">{entries.length} events</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => {
            const payload = entries.map((e) => `[${formatTime(e.ts)}] ${e.level.toUpperCase()} ${e.message}${e.data ? ` | ${e.data}` : ""}`).join("\n");
            void navigator.clipboard.writeText(payload);
          }}
          title="Copy logs"
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearLogEntries} title="Clear logs">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} title="Close">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="max-h-[50vh] overflow-y-auto px-3 py-2">
        {entries.length === 0 ? (
          <div className="py-6 text-center text-[11px] text-zinc-500">No logs yet.</div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div key={entry.id} className="rounded-[8px] border border-white/[0.06] bg-black/30 px-2.5 py-2">
                <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                  <span>{formatTime(entry.ts)}</span>
                  <span className={cn(
                    "rounded-[4px] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]",
                    entry.level === "error" && "bg-red-500/15 text-red-300",
                    entry.level === "warn" && "bg-amber-500/15 text-amber-300",
                    entry.level === "info" && "bg-sky-500/10 text-sky-200",
                  )}>
                    {entry.level}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-zinc-200">{entry.message}</div>
                {entry.data ? <div className="mt-1 text-[10px] text-zinc-500">{entry.data}</div> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
