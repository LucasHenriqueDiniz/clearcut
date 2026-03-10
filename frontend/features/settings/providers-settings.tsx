"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Cloud, Cpu, KeyRound, Save, ShieldX, Wifi } from "lucide-react";
import { Badge, Button, Card, Checkbox, Input, Select, Switch } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { getProviderSettings, getProvidersStatus, saveProviderSettings, testProvider } from "@/services/api";
import type { ProviderSettingsItem, ProviderSettingsPayload, ProviderStatus } from "@/types";
import { cn } from "@/lib/utils";

function providerMeta(name: string) {
  if (name.includes("rembg")) {
    return { icon: Cpu, description: "Runs locally on this machine. Model selection lives in General." };
  }
  return { icon: Cloud, description: "External provider with API keys, health checks and priority routing." };
}

function providerChip(status?: ProviderStatus, enabled?: boolean) {
  if (status?.is_local) return { label: "LOCAL", variant: "info" as const };
  if (enabled && status?.healthy) return { label: "CONNECTED", variant: "success" as const };
  if (enabled && !status?.healthy) return { label: "ATTENTION", variant: "warning" as const };
  return { label: "DISABLED", variant: "secondary" as const };
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

// ─── Section divider label ────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600">{children}</p>
  );
}

// ─── Health indicator ─────────────────────────────────────────────────────────

function HealthDot({ healthy }: { healthy: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-1.5 w-1.5 rounded-full",
        healthy ? "bg-emerald-400" : "bg-amber-400",
      )}
    />
  );
}

export function ProvidersSettings() {
  const [settings, setSettings] = useState<ProviderSettingsPayload | null>(null);
  const [statuses, setStatuses] = useState<ProviderStatus[]>([]);
  const [statusText, setStatusText] = useState("Loading providers...");
  const [testingName, setTestingName] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([getProviderSettings(), getProvidersStatus()])
      .then(([payload, statusList]) => {
        setSettings(payload);
        setStatuses(statusList);
        setStatusText(`${statusList.length} providers loaded`);
      })
      .catch((error) => setStatusText(String(error)));
  }, []);

  const statusByName = useMemo(
    () => Object.fromEntries(statuses.map((s) => [s.name, s])),
    [statuses],
  );

  const persist = async () => {
    if (!settings) return;
    try {
      await saveProviderSettings(settings);
      setSaved(true);
      setStatusText("Settings saved");
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      setStatusText(String(error));
    }
  };

  if (!settings) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-5">
        <Skeleton className="h-12 w-64 rounded-[10px]" />
        <Skeleton className="h-[120px] w-full  rounded-[14px]" />
        <Skeleton className="h-[180px] w-full  rounded-[14px]" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">Providers</p>
          <h2 className="mt-2 text-lg font-semibold text-zinc-100">Local and cloud routing</h2>
          <p className="mt-1 max-w-[520px] text-[12px] leading-5 text-zinc-400">
            Configure which providers are enabled, how keys are prioritised, and which backends receive requests.
          </p>
        </div>
        <Badge variant="secondary">{statusText}</Badge>
      </div>

      {/* Routing policy */}
      <Card className=" gap-0 py-0">
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-[13px] font-semibold text-zinc-100">Routing policy</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">Force all jobs through local providers only.</p>
          </div>
          <label className="flex cursor-pointer items-center gap-2.5 text-[12px] text-zinc-300">
            <Switch
              checked={settings.use_only_local}
              onCheckedChange={(checked) => setSettings({ ...settings, use_only_local: checked })}
            />
            <span>Local only</span>
          </label>
        </div>
        <div className="border-t border-white/[0.07] px-4 py-4">
          <label className="app-shell-field-label">Default quality preset</label>
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
          <p className="mt-2 text-[11px] text-zinc-500">
            Used by rembg_local unless a job-specific override is selected in General.
          </p>
        </div>
      </Card>

      {/* Provider cards */}
      <div className="flex  flex-col gap-3">
        {settings.providers.map((provider) => {
          const meta = providerMeta(provider.name);
          const Icon = meta.icon;
          const status = statusByName[provider.name];
          const chip = providerChip(status, provider.enabled);
          const isLocal = status?.is_local;

          return (
            <Card key={provider.name} className="gap-0 py-0">

              {/* Card header */}
              <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] px-4 py-3.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-white/[0.07] bg-[#16161a] text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-[12px] font-semibold text-zinc-100">{provider.name}</p>
                    <Badge variant={chip.variant}>{chip.label}</Badge>
                    {status !== undefined && (
                      <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                        <HealthDot healthy={status.healthy} />
                        {status.healthy ? "healthy" : "needs attention"}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-zinc-500">{meta.description}</p>
                </div>
                {/* Enabled toggle inline with header */}
                <label className="flex cursor-pointer items-center gap-2 text-[12px] text-zinc-400">
                  <Switch
                    checked={provider.enabled}
                    onCheckedChange={(checked) =>
                      setSettings(updateProvider(settings, provider.name, (p) => ({ ...p, enabled: checked })))
                    }
                  />
                  <span>{provider.enabled ? "Enabled" : "Disabled"}</span>
                </label>
              </div>

              {/* Card body */}
              <div className="space-y-4 px-4 py-4">

                {/* Priority + backend info / fallback */}
                <div className="grid gap-3 sm:grid-cols-[100px_minmax(0,1fr)]">
                  <div>
                    <label className="app-shell-field-label">Priority</label>
                    <Input
                      type="number"
                      value={provider.priority}
                      onChange={(event) =>
                        setSettings(updateProvider(settings, provider.name, (p) => ({ ...p, priority: Number(event.target.value) || 1 })))
                      }
                    />
                  </div>

                  {isLocal ? (
                    <div className="flex items-center gap-2 rounded-[10px] border border-white/[0.07] bg-black/20 px-3 py-2.5">
                      <Cpu className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
                      <p className="text-[11px] leading-5 text-zinc-400">
                        Model and output tuning are configured in the <span className="text-zinc-300">General</span> workspace.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className="app-shell-field-label">Fallback mode</label>
                      <Select
                        value={provider.enabled ? "enabled" : "disabled"}
                        onChange={(next) =>
                          setSettings(updateProvider(settings, provider.name, (p) => ({ ...p, enabled: next === "enabled" })))
                        }
                        options={[
                          { value: "enabled", label: "Enabled", hint: "active" },
                          { value: "disabled", label: "Disabled", hint: "off" },
                        ]}
                      />
                    </div>
                  )}
                </div>

                {/* API keys section — cloud providers only */}
                {!isLocal && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <SectionLabel>API keys</SectionLabel>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setSettings(
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
                        <KeyRound className="h-3.5 w-3.5" />
                        Add key
                      </Button>
                    </div>

                    {provider.keys.length ? (
                      <div className="space-y-1.5">
                        {provider.keys.map((key) => (
                          <div
                            key={key.id}
                            className="grid items-center gap-2 rounded-[10px] border border-white/[0.07] bg-black/20 p-2.5 sm:grid-cols-[110px_minmax(0,1fr)_72px_24px]"
                          >
                            <Input value={key.label} placeholder="Label" onChange={(e) =>
                              setSettings(updateProvider(settings, provider.name, (p) => ({
                                ...p,
                                keys: p.keys.map((k) => k.id === key.id ? { ...k, label: e.target.value } : k),
                              })))
                            } />
                            <Input
                              type="password"
                              className="font-mono text-[11px]"
                              value={key.key}
                              placeholder="Paste API key"
                              onChange={(e) =>
                                setSettings(updateProvider(settings, provider.name, (p) => ({
                                  ...p,
                                  keys: p.keys.map((k) => k.id === key.id ? { ...k, key: e.target.value } : k),
                                })))
                              }
                            />
                            <Input
                              type="number"
                              value={key.priority}
                              placeholder="Priority"
                              onChange={(e) =>
                                setSettings(updateProvider(settings, provider.name, (p) => ({
                                  ...p,
                                  keys: p.keys.map((k) => k.id === key.id ? { ...k, priority: Number(e.target.value) || 1 } : k),
                                })))
                              }
                            />
                            <Checkbox
                              checked={key.enabled}
                              onCheckedChange={(checked) =>
                                setSettings(updateProvider(settings, provider.name, (p) => ({
                                  ...p,
                                  keys: p.keys.map((k) => k.id === key.id ? { ...k, enabled: checked === true } : k),
                                })))
                              }
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[10px] border border-dashed border-white/[0.08] bg-black/20 px-3 py-3.5 text-[12px] text-zinc-500">
                        No API keys yet. Add a key to enable this provider.
                      </div>
                    )}
                  </div>
                )}

                {/* Last error */}
                {status?.last_error && (
                  <div className="flex items-start gap-2 rounded-[10px] border border-amber-500/20 bg-amber-500/8 px-3 py-2.5 text-[11px] text-amber-200">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{status.last_error}</span>
                  </div>
                )}

                {/* Footer row */}
                <div className="flex flex-wrap items-center gap-2">
                  {!isLocal && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={testingName === provider.name}
                      onClick={async () => {
                        setTestingName(provider.name);
                        try {
                          const result = await testProvider(provider.name);
                          setStatusText(`${provider.name}: ${result.message}`);
                        } catch (error) {
                          setStatusText(String(error));
                        } finally {
                          setTestingName(null);
                        }
                      }}
                    >
                      <Wifi className="h-3.5 w-3.5" />
                      {testingName === provider.name ? "Testing…" : "Test connection"}
                    </Button>
                  )}
                  <Badge variant="secondary">priority {provider.priority}</Badge>
                  <Badge variant="secondary">{status?.key_count ?? provider.keys.length} keys</Badge>
                </div>
              </div>
            </Card>
          );
        })}

        {/* Save */}
        <Button variant="primary" className="self-start" onClick={persist}>
          {saved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
          {saved ? "Saved" : "Save settings"}
        </Button>
      </div>
    </div>
  );
}
