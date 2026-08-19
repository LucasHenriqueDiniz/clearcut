import { useState, type ComponentType, type ReactNode } from "react";
import { FolderOpen, Gauge, Info, MonitorCog, ShieldCheck, X } from "lucide-react";

import { Button } from "@/components/ui";
import { openOutputFolder } from "@/services/api";
import { pickDirectoryPath, useIsTauri } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { useDefaultExportDirectory } from "@/lib/export-directory";

import { WatchFoldersSettings } from "./watch-folders-settings";

type SettingsTab = "general" | "watch-folders" | "performance";
type Props = {
  activeTab?: SettingsTab;
  onActiveTabChange?: (tab: SettingsTab) => void;
};

// ─── Shared SettingRow ────────────────────────────────────────────────────────
function SettingRow({
  title,
  hint,
  value,
}: {
  title: string;
  hint?: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-zinc-200">{title}</p>
        {hint ? <p className="mt-0.5 text-[10px] leading-[1.5] text-zinc-500">{hint}</p> : null}
      </div>
      <div className="shrink-0">{value}</div>
    </div>
  );
}

// ─── Section with icon header ─────────────────────────────────────────────────
function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[14px] border border-white/[0.08] bg-white/[0.02]">
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-white/[0.07] bg-white/[0.025] text-zinc-300">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div>
          <p className="text-[12px] font-semibold text-zinc-100">{title}</p>
          <p className="text-[10px] text-zinc-600">{description}</p>
        </div>
      </div>
      <div className="divide-y divide-white/[0.05] px-4">{children}</div>
    </div>
  );
}

// ─── Badge variant ────────────────────────────────────────────────────────────
function InfoBadge({
  children,
  accent,
}: {
  children: ReactNode;
  accent?: "sky" | "emerald" | "violet" | "default";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[5px] px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-wide",
        accent === "sky" && "border border-sky-500/20 bg-sky-500/[0.08] text-sky-400",
        accent === "emerald" && "border border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-400",
        accent === "violet" && "border border-violet-500/20 bg-violet-500/[0.08] text-violet-400",
        (!accent || accent === "default") &&
          "border border-white/[0.07] bg-white/[0.03] text-zinc-400",
      )}
    >
      {children}
    </span>
  );
}

// ─── Panes ────────────────────────────────────────────────────────────────────
function GeneralPane() {
  const isTauri = useIsTauri();
  const [outputStatus, setOutputStatus] = useState<string | null>(null);
  const [defaultExportDirectory, setDefaultExportDirectory, clearDefaultExportDirectory] = useDefaultExportDirectory();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-zinc-600">General</p>
        <h2 className="mt-1.5 text-[15px] font-semibold text-zinc-100">System overview</h2>
        <p className="mt-1 max-w-[520px] text-[12px] leading-[1.6] text-zinc-500">
          Runtime information and global actions. Model management lives in Models; automation lives in Watch Folders.
        </p>
      </div>

      <Section icon={MonitorCog} title="Runtime" description="Shell, theme and UI mode">
        <SettingRow
          title="Environment"
          hint="Desktop integration (file pickers, watch folders) requires the Tauri shell."
          value={
            <InfoBadge accent={isTauri ? "emerald" : "default"}>
              {isTauri ? "Desktop" : "Browser"}
            </InfoBadge>
          }
        />
        <SettingRow
          title="Theme"
          hint="Single tuned dark theme shipped with this build."
          value={<InfoBadge accent="sky">Dark</InfoBadge>}
        />
        <SettingRow
          title="Interface density"
          hint="Compact spacing optimized for batch work."
          value={<InfoBadge>Compact</InfoBadge>}
        />
      </Section>

      <Section icon={FolderOpen} title="Output" description="Actions related to generated files">
        <SettingRow
          title="Default export directory"
          hint="Manual jobs use this folder when Export does not set a custom override. Leave empty to use the backend output root."
          value={
            <div className="flex max-w-[360px] items-center gap-2">
              <span className="truncate rounded-[7px] border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 font-mono text-[10px] text-zinc-400">
                {defaultExportDirectory || "Backend default"}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={!isTauri}
                onClick={async () => {
                  const path = await pickDirectoryPath();
                  if (!path) return;
                  setDefaultExportDirectory(path);
                }}
              >
                Choose
              </Button>
              {defaultExportDirectory ? (
                <Button variant="ghost" size="sm" onClick={() => clearDefaultExportDirectory()}>
                  <X className="h-3.5 w-3.5" />
                  Clear
                </Button>
              ) : null}
            </div>
          }
        />
        <SettingRow
          title="Open output folder"
          hint="Opens the current global output location used by manual jobs."
          value={
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                try {
                  await openOutputFolder();
                  setOutputStatus(null);
                } catch (error) {
                  setOutputStatus(String(error));
                }
              }}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Open
            </Button>
          }
        />
        <SettingRow
          title="Save policy"
          hint="Manual jobs use the global output root; watch folders override output per automation rule."
          value={<InfoBadge>Explicit</InfoBadge>}
        />
        {outputStatus ? (
          <p className="pb-2.5 text-[11px] text-amber-300">{outputStatus}</p>
        ) : null}
      </Section>

      <Section icon={Info} title="About" description="Build and version information">
        <SettingRow
          title="App version"
          value={<span className="font-mono text-[11px] text-zinc-500">0.1.0</span>}
        />
        <SettingRow
          title="Architecture"
          hint="Providers handle execution routing. Models manage local assets. Watch Folders automate ingest."
          value={
            <InfoBadge accent="emerald">
              <ShieldCheck className="h-3 w-3" />
              Structured
            </InfoBadge>
          }
        />
      </Section>
    </div>
  );
}

function PerformancePane() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-zinc-600">Performance</p>
        <h2 className="mt-1.5 text-[15px] font-semibold text-zinc-100">Execution behavior</h2>
        <p className="mt-1 max-w-[520px] text-[12px] leading-[1.6] text-zinc-500">
          Concurrency and memory behavior are currently automatic. Tunable assets live in Models and Watch Folders.
        </p>
      </div>

      <Section icon={Gauge} title="Current policy" description="Global runtime defaults">
        <SettingRow
          title="Acceleration"
          hint="Chosen automatically by the local runtime and provider path."
          value={<InfoBadge accent="sky">Auto</InfoBadge>}
        />
        <SettingRow
          title="Workers"
          hint="The batch executor uses a fixed worker pool sized in the backend service."
          value={<InfoBadge>Fixed</InfoBadge>}
        />
        <SettingRow
          title="Model warmup"
          hint="Local model sessions are warmed lazily on first use."
          value={<InfoBadge accent="violet">Lazy</InfoBadge>}
        />
      </Section>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const tabs = [
  { id: "general" as const, label: "General" },
  { id: "watch-folders" as const, label: "Watch Folders" },
  { id: "performance" as const, label: "Performance" },
];

export function AppSettings({ activeTab: controlledActiveTab, onActiveTabChange }: Props) {
  const [internalActiveTab, setInternalActiveTab] = useState<SettingsTab>("general");
  const activeTab = controlledActiveTab ?? internalActiveTab;
  const setActiveTab = onActiveTabChange ?? setInternalActiveTab;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="border-b border-white/[0.07] bg-[#0d0d10] px-5 py-2.5">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "rounded-[8px] px-3 py-1.5 text-[11px] font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-white/[0.07] text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "general" ? <GeneralPane /> : null}
      {activeTab === "watch-folders" ? <WatchFoldersSettings /> : null}
      {activeTab === "performance" ? <PerformancePane /> : null}
    </div>
  );
}
