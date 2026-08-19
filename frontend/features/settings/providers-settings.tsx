"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Cloud, Cpu, KeyRound, Plus, Save, Trash2, Wifi } from "lucide-react";
import { Button, Checkbox, Input, Select, Switch } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { getProviderSettings, getProvidersStatus, saveProviderSettings, testProvider } from "@/services/api";
import type { ProviderSettingsItem, ProviderSettingsPayload, ProviderStatus } from "@/types";
import { cn } from "@/lib/utils";

function providerMeta(name: string) {
  if (name.includes("rembg")) {
    return {
      icon: Cpu,
      description: "Runs locally on this machine. Model selection lives in Workspace.",
    };
  }
  return {
    icon: Cloud,
    description: "Optional external backend. Keep disabled unless you want a cloud path.",
  };
}

function updateProvider(
  payload: ProviderSettingsPayload,
  providerName: string,
  updater: (provider: ProviderSettingsItem) => ProviderSettingsItem,
) {
  return {
    ...payload,
    providers: payload.providers.map((p) => (p.name === providerName ? updater(p) : p)),
  };
}

// ─── Shared stat pill (same as models/watch-folders) ─────────────────────────
function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1 rounded-[10px] border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-600">{label}</p>
      <p className="font-mono text-[18px] font-semibold text-zinc-100">{value}</p>
    </div>
  );
}

// ─── Status dot ───────────────────────────────────────────────────────────────
function StatusDot({ healthy }: { healthy: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-1.5 w-1.5 shrink-0 rounded-full",
        healthy
          ? "bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.55)]"
          : "bg-amber-400",
      )}
    />
  );
}

// ─── Provider card ────────────────────────────────────────────────────────────
function ProviderCard({
  provider,
  status,
  settings,
  testingName,
  onUpdate,
  onTest,
}: {
  provider: ProviderSettingsItem;
  status: ProviderStatus | undefined;
  settings: ProviderSettingsPayload;
  testingName: string | null;
  onUpdate: (next: ProviderSettingsPayload) => void;
  onTest: (name: string) => void;
}) {
  const meta = providerMeta(provider.name);
  const Icon = meta.icon;
  const isLocal = status?.is_local;

  const statusLabel = isLocal
    ? "Local"
    : provider.enabled && status?.healthy
      ? "Connected"
      : provider.enabled
        ? "Attention"
        : "Disabled";

  const statusColor = isLocal
    ? "text-sky-400"
    : provider.enabled && status?.healthy
      ? "text-emerald-400"
      : provider.enabled
        ? "text-amber-400"
        : "text-zinc-600";

  return (
    <div
      className={cn(
        "rounded-[14px] border transition-colors",
        provider.enabled
          ? "border-white/[0.08] bg-white/[0.02]"
          : "border-white/[0.04] bg-transparent opacity-70",
      )}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-4 py-3.5">
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-[9px] border",
            isLocal
              ? "border-sky-500/20 bg-sky-500/[0.08] text-sky-400"
              : "border-white/[0.07] bg-white/[0.025] text-zinc-400",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-[12px] font-semibold text-zinc-100">{provider.name}</p>
            <div className="flex items-center gap-1.5">
              {status !== undefined ? <StatusDot healthy={status.healthy} /> : null}
              <span className={cn("text-[10px] font-medium", statusColor)}>{statusLabel}</span>
            </div>
          </div>
          <p className="mt-0.5 text-[10px] text-zinc-600">{meta.description}</p>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-400">
          <Switch
            checked={provider.enabled}
            onCheckedChange={(checked) =>
              onUpdate(updateProvider(settings, provider.name, (p) => ({ ...p, enabled: checked })))
            }
          />
          <span>{provider.enabled ? "Enabled" : "Disabled"}</span>
        </label>
      </div>

      {/* Body */}
      <div className="space-y-4 px-4 py-4">
        {isLocal ? (
          <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.015] px-3 py-3">
            <div className="flex items-center gap-2">
              <Cpu className="h-3.5 w-3.5 text-zinc-600" />
              <p className="text-[12px] font-medium text-zinc-200">Built-in local runtime</p>
            </div>
            <p className="mt-1.5 text-[11px] leading-[1.55] text-zinc-500">
              This is the default execution path. Pick the active cutout model in Workspace and manage installed assets in Models.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[110px_minmax(0,1fr)]">
            <div className="space-y-1.5">
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-600">Standby order</p>
              <Input
                type="number"
                value={provider.priority}
                onChange={(event) =>
                  onUpdate(
                    updateProvider(settings, provider.name, (p) => ({
                      ...p,
                      priority: Number(event.target.value) || 1,
                    })),
                  )
                }
              />
            </div>
            <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.015] px-3 py-3">
              <p className="text-[12px] font-medium text-zinc-200">Optional cloud path</p>
              <p className="mt-1 text-[11px] leading-[1.55] text-zinc-500">
                Keep disabled unless you explicitly want a network-backed provider. Lower standby order wins first.
              </p>
            </div>
          </div>
        )}

        {/* API keys — cloud only */}
        {!isLocal ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-600">API keys</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  onUpdate(
                    updateProvider(settings, provider.name, (p) => ({
                      ...p,
                      keys: [
                        ...p.keys,
                        {
                          id: crypto.randomUUID(),
                          label: `key-${p.keys.length + 1}`,
                          key: "",
                          enabled: true,
                          priority: p.keys.length + 1,
                          usage_notes: "",
                          monthly_limit: null,
                          daily_limit: null,
                          used_count: 0,
                          last_error: null,
                          last_success_at: null,
                          cooldown_until: null,
                        },
                      ],
                    })),
                  )
                }
              >
                <Plus className="h-3 w-3" />
                Add key
              </Button>
            </div>

            {provider.keys.length ? (
              <div className="space-y-1.5">
                {provider.keys.map((key) => (
                  <div
                    key={key.id}
                    className="grid items-center gap-2 rounded-[10px] border border-white/[0.06] bg-white/[0.01] p-2.5 sm:grid-cols-[100px_minmax(0,1fr)_60px_20px_20px]"
                  >
                    <Input
                      value={key.label}
                      placeholder="Label"
                      onChange={(e) =>
                        onUpdate(
                          updateProvider(settings, provider.name, (p) => ({
                            ...p,
                            keys: p.keys.map((k) =>
                              k.id === key.id ? { ...k, label: e.target.value } : k,
                            ),
                          })),
                        )
                      }
                    />
                    <Input
                      type="password"
                      className="font-mono text-[11px]"
                      value={key.key}
                      placeholder="Paste API key"
                      onChange={(e) =>
                        onUpdate(
                          updateProvider(settings, provider.name, (p) => ({
                            ...p,
                            keys: p.keys.map((k) =>
                              k.id === key.id ? { ...k, key: e.target.value } : k,
                            ),
                          })),
                        )
                      }
                    />
                    <Input
                      type="number"
                      value={key.priority}
                      placeholder="Order"
                      onChange={(e) =>
                        onUpdate(
                          updateProvider(settings, provider.name, (p) => ({
                            ...p,
                            keys: p.keys.map((k) =>
                              k.id === key.id ? { ...k, priority: Number(e.target.value) || 1 } : k,
                            ),
                          })),
                        )
                      }
                    />
                    <Checkbox
                      checked={key.enabled}
                      onCheckedChange={(checked) =>
                        onUpdate(
                          updateProvider(settings, provider.name, (p) => ({
                            ...p,
                            keys: p.keys.map((k) =>
                              k.id === key.id ? { ...k, enabled: checked === true } : k,
                            ),
                          })),
                        )
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onUpdate(
                          updateProvider(settings, provider.name, (p) => ({
                            ...p,
                            keys: p.keys.filter((k) => k.id !== key.id),
                          })),
                        )
                      }
                      className="flex h-5 w-5 items-center justify-center rounded-[5px] text-zinc-600 transition-colors hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[10px] border border-dashed border-white/[0.07] px-3 py-3.5 text-[11px] text-zinc-600">
                No API keys yet. Add a key to enable this provider.
              </div>
            )}
          </div>
        ) : null}

        {/* Last error */}
        {status?.last_error ? (
          <div className="flex items-start gap-2 rounded-[10px] border border-amber-500/20 bg-amber-500/[0.07] px-3 py-2.5 text-[11px] text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{status.last_error}</span>
          </div>
        ) : null}

        {/* Footer */}
        {!isLocal ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={testingName === provider.name}
              onClick={() => onTest(provider.name)}
            >
              <Wifi className="h-3 w-3" />
              {testingName === provider.name ? "Testing…" : "Test connection"}
            </Button>
            <span className="rounded-[5px] border border-white/[0.07] bg-white/[0.02] px-2 py-1 text-[10px] text-zinc-500">
              standby {provider.priority}
            </span>
            <span className="rounded-[5px] border border-white/[0.07] bg-white/[0.02] px-2 py-1 text-[10px] text-zinc-500">
              {status?.key_count ?? provider.keys.length} keys
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function ProvidersSettings() {
  const [settings, setSettings] = useState<ProviderSettingsPayload | null>(null);
  const [statuses, setStatuses] = useState<ProviderStatus[]>([]);
  const [testingName, setTestingName] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([getProviderSettings(), getProvidersStatus()]).then(([payload, statusList]) => {
      setSettings(payload);
      setStatuses(statusList);
    });
  }, []);

  const statusByName = useMemo(
    () => Object.fromEntries(statuses.map((s) => [s.name, s])),
    [statuses],
  );

  const localCount = statuses.filter((s) => s.is_local).length;
  const cloudEnabledCount =
    settings?.providers.filter((p) => !statusByName[p.name]?.is_local && p.enabled).length ?? 0;
  const healthyCount = statuses.filter((s) => s.healthy).length;

  const persist = async () => {
    if (!settings) return;
    try {
      await saveProviderSettings(settings);
      setSaved(true);
      setSaveError(null);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      setSaveError(String(error));
    }
  };

  const handleTest = async (name: string) => {
    setTestingName(name);
    try {
      await testProvider(name);
    } finally {
      setTestingName(null);
    }
  };

  if (!settings) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-20 rounded-[6px]" />
          <Skeleton className="h-5 w-52 rounded-[8px]" />
          <Skeleton className="h-3 w-80 rounded-[6px]" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-[68px] rounded-[10px]" />)}
        </div>
        <Skeleton className="h-[140px] rounded-[14px]" />
        <Skeleton className="h-[180px] rounded-[14px]" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-zinc-600">Providers</p>
          <h2 className="mt-1.5 text-[15px] font-semibold text-zinc-100">Execution backends</h2>
          <p className="mt-1 max-w-[520px] text-[12px] leading-[1.6] text-zinc-500">
            The default path is local processing. Cloud providers are optional backups — keep them disabled unless you explicitly need them.
          </p>
        </div>
        <Button variant={saved ? "primary" : "secondary"} onClick={() => void persist()}>
          {saved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
          {saved ? "Saved" : "Save"}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <StatPill label="Local" value={localCount} />
        <StatPill label="Cloud active" value={cloudEnabledCount} />
        <StatPill label="Healthy" value={healthyCount} />
      </div>

      {/* Save error */}
      {saveError ? (
        <div className="flex items-start gap-2 rounded-[10px] border border-red-500/20 bg-red-500/[0.06] px-3 py-3 text-[11px] text-red-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {saveError}
        </div>
      ) : null}

      {/* Routing policy */}
      <div className="rounded-[14px] border border-white/[0.08] bg-white/[0.02]">
        <div className="flex flex-wrap items-start justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-[12px] font-semibold text-zinc-100">Local-only mode</p>
            <p className="mt-0.5 text-[11px] leading-[1.55] text-zinc-500">
              Forces all processing through local providers. Cloud fallbacks are skipped even if enabled.
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-300">
            <Switch
              checked={settings.use_only_local}
              onCheckedChange={(checked) => setSettings({ ...settings, use_only_local: checked })}
            />
            <span>Local only</span>
          </label>
        </div>
        <div className="border-t border-white/[0.06] px-4 py-4">
          <div className="space-y-1.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-600">Default quality preset</p>
            <Select
              value={settings.default_quality_preset}
              onChange={(value) =>
                setSettings({
                  ...settings,
                  default_quality_preset: value as ProviderSettingsPayload["default_quality_preset"],
                })
              }
              options={[
                { value: "fast", label: "Fast", hint: "speed" },
                { value: "balanced", label: "Balanced", hint: "default" },
                { value: "hq", label: "HQ", hint: "best edges" },
              ]}
            />
            <p className="text-[10px] text-zinc-600">
              Used by the local cutout runtime unless a workspace preset overrides it.
            </p>
          </div>
        </div>
      </div>

      {/* Provider cards */}
      <div className="flex flex-col gap-2.5">
        {settings.providers.map((provider) => (
          <ProviderCard
            key={provider.name}
            provider={provider}
            status={statusByName[provider.name]}
            settings={settings}
            testingName={testingName}
            onUpdate={setSettings}
            onTest={(name) => void handleTest(name)}
          />
        ))}
      </div>
    </div>
  );
}