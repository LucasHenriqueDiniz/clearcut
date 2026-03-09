"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectOption = {
  value: string;
  label: string;
  hint?: string;
  dotColor?: string;
  group?: string;
  disabled?: boolean;
};

type SelectProps = {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
};

export function Select({ value, options, onChange, className }: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, []);

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? options[0],
    [options, value],
  );

  const groups = useMemo(() => {
    const grouped = new Map<string, SelectOption[]>();
    for (const option of options) {
      const key = option.group ?? "";
      grouped.set(key, [...(grouped.get(key) ?? []), option]);
    }
    return Array.from(grouped.entries());
  }, [options]);

  return (
    <div ref={ref} className={cn("relative z-[20] w-full", className)}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex h-8 w-full items-center justify-between rounded-[9px] border border-[var(--border)] bg-black/20 px-[9px] text-[12px] text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-[border-color,background-color,box-shadow]",
          "hover:border-[var(--border-m)] hover:bg-white/[0.05]",
          open && "rounded-b-none border-indigo-400/45 bg-indigo-500/[0.05] shadow-[0_0_0_1px_rgba(99,102,241,0.16),inset_0_1px_0_rgba(255,255,255,0.04)]",
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-[7px]">
          {selected?.dotColor ? (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: selected.dotColor, boxShadow: `0 0 10px ${selected.dotColor}66` }}
            />
          ) : null}
          <span className="truncate">{selected?.label}</span>
        </span>
        <ChevronDown className={cn("h-[11px] w-[11px] shrink-0 text-[var(--muted)] transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-full z-[80] overflow-hidden rounded-b-[11px] border border-[var(--border-m)] border-t-indigo-400/25 bg-[rgba(28,28,33,0.92)] shadow-[0_24px_48px_rgba(0,0,0,0.45)] backdrop-blur-xl animate-[dropIn_0.12s_ease]">
          <div className="max-h-[220px] overflow-y-auto p-1">
            {groups.map(([group, groupOptions], groupIndex) => (
              <div key={group || `group-${groupIndex}`}>
                {group ? (
                  <p className="px-[9px] pb-[4px] pt-[7px] font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500">
                    {group}
                  </p>
                ) : null}
                {groupOptions.map((option) => {
                  const active = option.value === value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={option.disabled}
                      onClick={() => {
                        if (option.disabled) return;
                        onChange(option.value);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-[6px] px-[9px] py-[7px] text-left text-[12px] text-[var(--text-2)] transition-colors",
                        "hover:bg-white/[0.06] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40",
                        active && "bg-[var(--accent-lo)] text-indigo-300",
                      )}
                    >
                      {option.dotColor ? (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: option.dotColor, boxShadow: `0 0 10px ${option.dotColor}66` }}
                        />
                      ) : null}
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {option.hint ? <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-500">{option.hint}</span> : null}
                      {active ? <Check className="h-3 w-3 shrink-0 text-[hsl(var(--accent))]" /> : null}
                    </button>
                  );
                })}
                {groupIndex < groups.length - 1 ? <div className="mx-1 my-[3px] h-px bg-[var(--border)]" /> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
