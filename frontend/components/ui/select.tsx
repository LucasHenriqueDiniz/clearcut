"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

type DropdownPos = { top: number; left: number; width: number; openUpward: boolean };

export function Select({ value, options, onChange, className }: SelectProps) {
  const [open, setOpen]   = useState(false);
  const [pos, setPos]     = useState<DropdownPos | null>(null);
  const triggerRef        = useRef<HTMLButtonElement>(null);
  const dropdownRef       = useRef<HTMLDivElement>(null);

  // Compute position relative to viewport when opening
  const openDropdown = () => {
    if (!triggerRef.current) return;
    const rect   = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const maxH    = 220;
    const openUpward = spaceBelow < maxH + 8 && spaceAbove > spaceBelow;
    setPos({
      top: openUpward ? rect.top - 4 : rect.bottom,
      left: rect.left,
      width: rect.width,
      openUpward,
    });
    setOpen(true);
  };

  // Close on outside click or scroll
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    };
    const closeOnScroll = () => setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [open]);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? options[0],
    [options, value],
  );

  const groups = useMemo(() => {
    const map = new Map<string, SelectOption[]>();
    for (const o of options) {
      const k = o.group ?? "";
      map.set(k, [...(map.get(k) ?? []), o]);
    }
    return Array.from(map.entries());
  }, [options]);

  const dropdown = open && pos ? (
    <div
      ref={dropdownRef}
      style={{
        position: "fixed",
        left: pos.left,
        width: pos.width,
        zIndex: 9999,
        ...(pos.openUpward
          ? { bottom: window.innerHeight - pos.top, top: "auto" }
          : { top: pos.top }),
      }}
      className={cn(
        "overflow-hidden border border-white/[0.12] bg-[#171720] shadow-[0_24px_48px_rgba(0,0,0,0.72)] animate-[dropIn_0.12s_ease]",
        pos.openUpward
          ? "rounded-t-[11px] rounded-b-[11px] border-b-indigo-400/25"
          : "rounded-b-[11px] border-t-indigo-400/25",
      )}
    >
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
                  onMouseDown={(e) => {
                    // mousedown before blur so click registers
                    e.preventDefault();
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
                  {option.hint ? (
                    <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-500">
                      {option.hint}
                    </span>
                  ) : null}
                  {active ? <Check className="h-3 w-3 shrink-0 text-[hsl(var(--accent))]" /> : null}
                </button>
              );
            })}
            {groupIndex < groups.length - 1 ? (
              <div className="mx-1 my-[3px] h-px bg-white/[0.07]" />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <div className={cn("relative w-full", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openDropdown())}
        className={cn(
          "flex h-8 w-full items-center justify-between rounded-[9px] border border-white/[0.07] bg-[#141419] px-[9px] text-[12px] text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-[border-color,background-color,box-shadow]",
          "hover:border-white/[0.12] hover:bg-[#1a1a20]",
          open && "border-indigo-400/45 bg-[#1a1a22] shadow-[0_0_0_1px_rgba(99,102,241,0.16),inset_0_1px_0_rgba(255,255,255,0.04)]",
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
        <ChevronDown
          className={cn(
            "h-[11px] w-[11px] shrink-0 text-[var(--muted)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {typeof document !== "undefined" ? createPortal(dropdown, document.body) : null}
    </div>
  );
}
