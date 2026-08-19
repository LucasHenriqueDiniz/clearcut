import type { MouseEvent as ReactMouseEvent } from "react";
import { Clock3, Settings2, Sparkles } from "lucide-react";
import { WindowControls } from "@/components/window-controls";
import { cn } from "@/lib/utils";

export type MainTab = "workspace" | "settings" | "history";

const NAV: Array<{ id: MainTab; label: string; icon: typeof Sparkles }> = [
  { id: "workspace", label: "Workspace", icon: Sparkles },
  { id: "history", label: "History", icon: Clock3 },
];

type Props = {
  activeTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  /** Shows a pulse on Workspace while a batch runs. */
  processing?: boolean;
  onMouseDown?: (event: ReactMouseEvent<HTMLElement>) => void;
  className?: string;
};

/**
 * The app's primary navigation.
 *
 * Always rendered. Navigation used to live inside the Tauri-only title bar,
 * which meant the browser build had no way to reach Settings, Models,
 * Providers or History at all.
 */
export function AppHeader({ activeTab, onTabChange, processing, onMouseDown, className }: Props) {
  return (
    <header
      onMouseDown={onMouseDown}
      className={cn(
        "relative flex h-[38px] shrink-0 items-center border-b border-white/[0.07] bg-[#0a0a0c]",
        className,
      )}
    >
      <div data-tauri-drag-region className="absolute inset-x-0 top-0 h-1.5" />

      <div className="flex h-full items-center gap-2 pl-3 pr-4" data-titlebar-ignore-drag>
        <img
          src="/icon.png"
          alt=""
          className="h-[18px] w-[18px] rounded-[5px] border border-white/[0.12] object-cover"
        />
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600">
          ClearCut
        </span>
      </div>

      <nav aria-label="Main" className="flex h-full items-center border-l border-white/[0.07]" data-titlebar-ignore-drag>
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onTabChange(item.id)}
              className={cn(
                "relative flex h-full items-center gap-1.5 border-r border-white/[0.07] px-4 text-[11px] transition-colors",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-indigo-400/70",
                active
                  ? "bg-white/[0.022] text-zinc-100"
                  : "text-zinc-500 hover:bg-white/[0.02] hover:text-zinc-300",
              )}
            >
              {processing && item.id === "workspace" ? (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.7)]" />
              ) : (
                <Icon className="h-3 w-3" />
              )}
              {item.label}
              {active ? <span className="absolute inset-x-0 bottom-0 h-px bg-indigo-400/70" /> : null}
            </button>
          );
        })}
      </nav>

      {/* Draggable gap. Keep it free of controls. */}
      <div data-tauri-drag-region className="h-full flex-1" />

      <button
        type="button"
        data-titlebar-ignore-drag
        aria-current={activeTab === "settings" ? "page" : undefined}
        onClick={() => onTabChange("settings")}
        title="Settings, models and providers"
        className={cn(
          "flex h-full items-center gap-1.5 border-l border-white/[0.07] px-3.5 text-[11px] transition-colors",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-indigo-400/70",
          activeTab === "settings"
            ? "bg-white/[0.022] text-zinc-100"
            : "text-zinc-500 hover:bg-white/[0.02] hover:text-zinc-300",
        )}
      >
        <Settings2 className="h-3.5 w-3.5" />
        Settings
      </button>

      <WindowControls />
    </header>
  );
}
