"use client";

import { useState, type ComponentType, type ReactNode } from "react";
import { FolderOpen, Gauge, Info, MonitorCog, ShieldCheck } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { openOutputFolder } from "@/services/api";
import { useIsTauri } from "@/lib/platform";

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
    <div className="flex items-start justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-zinc-100">{title}</p>
        {hint ? <p className="mt-1 text-[11px] leading-5 text-zinc-500">{hint}</p> : null}
      </div>
      <div className="shrink-0">{value}</div>
    </div>
  );
}

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
    <Card className="gap-0 py-0">
      <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/[0.07] bg-[#16161a] text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[13px] font-semibold text-zinc-100">{title}</p>
          <p className="mt-1 text-[11px] text-zinc-500">{description}</p>
        </div>
      </div>
      <div className="space-y-0 divide-y divide-white/[0.07] px-4 py-2">{children}</div>
    </Card>
  );
}

export function AppSettings() {
  const isTauri = useIsTauri();
  const [statusText, setStatusText] = useState("Read-only system info");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
      <div className="flex max-w-[720px] items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">Settings</p>
          <h2 className="mt-2 text-lg font-semibold text-zinc-100">System overview</h2>
          <p className="mt-1 max-w-[560px] text-[12px] leading-5 text-zinc-400">
            This page now focuses on real runtime information and safe actions instead of placeholder controls.
          </p>
        </div>
        <Badge variant="secondary">{statusText}</Badge>
      </div>

      <div className="flex flex-col gap-3">
        <Section icon={MonitorCog} title="Runtime" description="Current shell, theme and UI mode">
          <SettingRow
            title="Environment"
            hint="Desktop integration is only available in the Tauri shell."
            value={<Badge variant={isTauri ? "success" : "secondary"}>{isTauri ? "DESKTOP" : "BROWSER"}</Badge>}
          />
          <SettingRow title="Theme" hint="The current build ships a single tuned dark theme." value={<Badge variant="info">DARK</Badge>} />
          <SettingRow title="Interface density" hint="Compact spacing optimized for batch work." value={<Badge variant="secondary">COMPACT</Badge>} />
        </Section>

        <Section icon={FolderOpen} title="Output" description="Actions related to generated files">
          <SettingRow
            title="Open output folder"
            hint="Jumps to the current output location or copies the host path when needed."
            value={
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  try {
                    const result = await openOutputFolder();
                    setStatusText(result.message);
                  } catch (error) {
                    setStatusText(String(error));
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
            hint="Jobs save only when there is a concrete output to write. There are no hidden autosave toggles on this page."
            value={<Badge variant="secondary">EXPLICIT</Badge>}
          />
        </Section>

        <Section icon={Gauge} title="Performance" description="Execution behavior used in this build">
          <SettingRow
            title="Acceleration"
            hint="Backend acceleration is chosen automatically by the active provider and local environment."
            value={<Badge variant="secondary">AUTO</Badge>}
          />
          <SettingRow
            title="Worker controls"
            hint="Batch parallelism is configured in the General workspace where it actually affects processing."
            value={<Badge variant="info">GENERAL PAGE</Badge>}
          />
        </Section>

        <Section icon={Info} title="About" description="Build and support information">
          <SettingRow title="App version" value={<span className="font-mono text-[11px] text-zinc-400">0.1.0</span>} />
          <SettingRow
            title="Support posture"
            hint="This page intentionally avoids fake toggles or placeholders that do not persist yet."
            value={
              <Badge variant="success">
                <ShieldCheck className="h-3 w-3" />
                CLEANED UP
              </Badge>
            }
          />
        </Section>
      </div>
    </div>
  );
}
