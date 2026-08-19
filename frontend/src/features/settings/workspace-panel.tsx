import { useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Select } from "@/components/ui";
import { JobSettingsPanel } from "@/features/settings/job-settings-panel";
import { WORKFLOW_MODES, modeFromOptions } from "@/features/jobs/workflow-modes";
import { useAppStore } from "@/stores/use-app-store";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  activeTab: React.ComponentProps<typeof JobSettingsPanel>["activeTab"];
  onActiveTabChange: React.ComponentProps<typeof JobSettingsPanel>["onActiveTabChange"];
  onOpenWatchFolders?: () => void;
  onOpenPerformance?: () => void;
};

const FORMATS = [
  { value: "png", label: "PNG · keeps transparency" },
  { value: "webp", label: "WebP · smallest" },
  { value: "jpeg", label: "JPEG · no transparency" },
  { value: "avif", label: "AVIF · smallest, slower" },
];

const QUALITY = [
  { value: "fast", label: "Fast" },
  { value: "balanced", label: "Balanced" },
  { value: "hq", label: "Best" },
];

/**
 * The workspace's left column.
 *
 * Starts from a choice of job rather than from thirty controls: the five
 * pipeline tabs are all still here, one click away, but they no longer greet
 * you before you have said what you want to do.
 */
export function WorkspacePanel({
  className,
  activeTab,
  onActiveTabChange,
  onOpenWatchFolders,
  onOpenPerformance,
}: Props) {
  const options = useAppStore((s) => s.options);
  const setOptions = useAppStore((s) => s.setOptions);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const mode = modeFromOptions(options);
  const cuttingOut = options.remove_background;

  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden bg-[#0d0d10]", className)}>
      <div className="min-h-0 flex-1 overflow-auto">
        <fieldset className="border-b border-white/[0.06] px-4 py-4">
          <legend className="mb-2.5 font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-500">
            What do you want to do
          </legend>
          <div className="flex flex-col gap-1.5">
            {WORKFLOW_MODES.map((item) => {
              const active = mode === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setOptions(item.apply)}
                  className={cn(
                    "rounded-[10px] border px-3 py-2.5 text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400/70",
                    active
                      ? "border-indigo-400/40 bg-indigo-500/10"
                      : "border-white/[0.07] bg-white/[0.015] hover:border-white/[0.12] hover:bg-white/[0.04]",
                  )}
                >
                  <span className={cn("block text-[12px] font-semibold", active ? "text-indigo-200" : "text-zinc-200")}>
                    {item.label}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] leading-snug text-zinc-500">{item.summary}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="border-b border-white/[0.06] px-4 py-4">
          <legend className="mb-2.5 font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-500">
            Output
          </legend>
          <div className="flex flex-col gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] text-zinc-400">File format</span>
              <Select
                value={options.output_format === "jpg" ? "jpeg" : options.output_format}
                options={FORMATS}
                onChange={(value) => setOptions({ output_format: value as typeof options.output_format })}
              />
            </label>

            {cuttingOut ? (
              <label className="block">
                <span className="mb-1 block text-[11px] text-zinc-400">Cutout quality</span>
                <Select
                  value={options.local_quality_preset ?? "balanced"}
                  options={QUALITY}
                  onChange={(value) =>
                    setOptions({ local_quality_preset: value as typeof options.local_quality_preset })
                  }
                />
                <span className="mt-1 block text-[10px] leading-snug text-zinc-600">
                  Higher quality is slower and uses a larger model.
                </span>
              </label>
            ) : null}
          </div>
        </fieldset>

        <div className="px-4 py-3">
          <button
            type="button"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((open) => !open)}
            className={cn(
              "flex w-full items-center gap-2 rounded-[9px] border border-white/[0.07] px-3 py-2 text-[11px] text-zinc-400 transition-colors",
              "hover:border-white/[0.12] hover:bg-white/[0.04] hover:text-zinc-200",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400/70",
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Advanced options
            <ChevronDown
              className={cn("ml-auto h-3.5 w-3.5 transition-transform", advancedOpen && "rotate-180")}
            />
          </button>
        </div>

        {advancedOpen ? (
          <JobSettingsPanel
            activeTab={activeTab}
            onActiveTabChange={onActiveTabChange}
            onOpenWatchFolders={onOpenWatchFolders}
            onOpenPerformance={onOpenPerformance}
            showLocalTabs={false}
          />
        ) : null}
      </div>
    </div>
  );
}
