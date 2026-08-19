import { useEffect, useId, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { ChevronRight, Download, FolderInput, Info, Plus, Scissors, Sparkles, Trash2, WandSparkles } from "lucide-react";
import { Button, Checkbox, Input, Select, Slider, Switch } from "@/components/ui";
import { OptionPreview } from "@/components/option-preview";
import { createPreset, deletePreset, listModelCatalog, listPresets, updatePreset } from "@/services/api";
import { FALLBACK_PRESETS } from "@/lib/default-presets";
import { useDefaultExportDirectory } from "@/lib/export-directory";
import { pickDirectoryPath, useIsTauri } from "@/lib/platform";
import { useAppStore } from "@/stores/use-app-store";
import { cn } from "@/lib/utils";
import type { ModelCatalogItem, PresetItem, ProcessingOptions } from "@/types";

type PipelineTab = "input" | "preprocess" | "cutout" | "postprocess" | "export";

type Props = {
  activeTab?: PipelineTab;
  onActiveTabChange?: (tab: PipelineTab) => void;
  onOpenWatchFolders?: () => void;
  onOpenPerformance?: () => void;
  showLocalTabs?: boolean;
  className?: string;
};

const pipelineTabs: Array<{
  id: PipelineTab;
  label: string;
  shortLabel: string;
  icon: ComponentType<{ className?: string }>;
  description: string;
  color: string;
}> = [
  {
    id: "input",
    label: "Input",
    shortLabel: "Input",
    icon: FolderInput,
    description: "How images enter the pipeline",
    color: "text-sky-400",
  },
  {
    id: "preprocess",
    label: "Preprocess",
    shortLabel: "Pre",
    icon: Sparkles,
    description: "Image cleanup before cutout",
    color: "text-violet-400",
  },
  {
    id: "cutout",
    label: "Cutout",
    shortLabel: "Cut",
    icon: Scissors,
    description: "Background removal",
    color: "text-rose-400",
  },
  {
    id: "postprocess",
    label: "Postprocess",
    shortLabel: "Post",
    icon: WandSparkles,
    description: "Canvas and finishing",
    color: "text-amber-400",
  },
  {
    id: "export",
    label: "Export",
    shortLabel: "Export",
    icon: Download,
    description: "Final file generation",
    color: "text-emerald-400",
  },
];

const qualityPresetOptions = [
  { value: "fast", label: "Fast" },
  { value: "balanced", label: "Balanced" },
  { value: "high", label: "High" },
];
const enhanceEngineOptions = [{ value: "realesrgan", label: "Real-ESRGAN" }];
const enhanceStrengthOptions = [
  { value: "2x", label: "2x" },
  { value: "4x", label: "4x" },
];
const enhanceStageOptions = [
  { value: "enhance_then_cutout", label: "Before cutout" },
  { value: "cutout_then_enhance", label: "After cutout" },
];
const resizeModeOptions = [
  { value: "keep", label: "Keep original" },
  { value: "custom", label: "Custom size" },
];
const postAspectOptions = [
  { value: "keep", label: "Keep" },
  { value: "square", label: "Square" },
  { value: "custom", label: "Custom" },
];
const backgroundOptions = [
  { value: "transparent", label: "Transparent" },
  { value: "solid", label: "Solid color" },
];
const exportFormatOptions = [
  { value: "png", label: "PNG" },
  { value: "webp", label: "WebP" },
  { value: "jpeg", label: "JPEG" },
  { value: "avif", label: "AVIF" },
];
const templateTokens = ["{name}", "{date}", "{index}", "{width}", "{height}", "{model}"];

function mapQualityToUi(value: ProcessingOptions["local_quality_preset"]): "fast" | "balanced" | "high" {
  if (value === "hq") return "high";
  return value === "fast" ? "fast" : "balanced";
}
function mapQualityFromUi(value: string): "fast" | "balanced" | "hq" {
  if (value === "high") return "hq";
  return value === "fast" ? "fast" : "balanced";
}

// ─── Section ────────────────────────────────────────────────────────────────
function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3", className)}>
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-600">{title}</p>
      {children}
    </section>
  );
}

// ─── HelpHint ────────────────────────────────────────────────────────────────
function HelpHint({ title, description }: { title: string; description: string }) {
  return (
    <details className="group relative">
      <summary
        className="list-none cursor-pointer text-zinc-600 transition-colors hover:text-zinc-300"
        aria-label={`Help: ${title}`}
      >
        <Info className="h-3 w-3" />
      </summary>
      <div className="absolute right-0 top-5 z-[60] w-[240px] rounded-[10px] border border-white/[0.09] bg-[#141418] p-3 shadow-[0_20px_48px_rgba(0,0,0,0.65)]">
        <p className="text-[11px] font-semibold text-zinc-100">{title}</p>
        <p className="mt-1 text-[11px] leading-[1.55] text-zinc-400">{description}</p>
      </div>
    </details>
  );
}

// ─── Field ───────────────────────────────────────────────────────────────────
function Field({ label, help, children, hint, preview }: { label: string; help?: ReactNode; children: ReactNode; hint?: string; preview?: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <label className="text-[11px] font-medium text-zinc-300">{label}</label>
          {hint ? <p className="text-[10px] text-zinc-600 mt-0.5">{hint}</p> : null}
        </div>
        {help}
      </div>
      {preview ? (
        <div className="flex items-start gap-2.5">
          {preview}
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

// ─── ToggleCard ───────────────────────────────────────────────────────────────
function ToggleCard({
  label,
  hint,
  checked,
  onChange,
  help,
  accent = false,
  preview,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  help?: ReactNode;
  accent?: boolean;
  preview?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-[10px] border px-3 py-2.5 transition-colors",
        checked && accent
          ? "border-violet-500/20 bg-violet-500/[0.06]"
          : "border-white/[0.06] bg-white/[0.015]",
      )}
    >
      {preview}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-[12px] font-medium text-zinc-200">{label}</p>
          {help}
        </div>
        {hint ? <p className="mt-0.5 text-[10px] leading-[1.45] text-zinc-500">{hint}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

// ─── CheckRow ────────────────────────────────────────────────────────────────
function CheckRow({
  label,
  hint,
  checked,
  onChange,
  help,
  preview,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  help?: ReactNode;
  preview?: ReactNode;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-white/[0.06] bg-white/[0.01] px-3 py-2.5 transition-colors hover:bg-white/[0.03]"
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onChange(Boolean(value))}
        className="mt-0.5 shrink-0"
      />
      {preview}
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-zinc-200">{label}</p>
        {hint ? <p className="mt-0.5 text-[10px] leading-[1.45] text-zinc-500">{hint}</p> : null}
      </div>
      {help}
    </label>
  );
}

// ─── FuturePill ───────────────────────────────────────────────────────────────
function FuturePill({ items }: { items: string[] }) {
  return (
    <div className="rounded-[9px] border border-dashed border-white/[0.07] px-3 py-2.5">
      <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-zinc-700">Coming soon</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="rounded-[5px] border border-white/[0.06] bg-white/[0.02] px-2 py-0.5 text-[10px] text-zinc-600"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function JobSettingsPanel({
  activeTab: controlledActiveTab,
  onActiveTabChange,
  onOpenWatchFolders,
  onOpenPerformance,
  showLocalTabs = true,
  className,
}: Props) {
  const {
    options,
    setOptions,
    activePreset,
    setActivePreset,
    skipDuplicates,
    setSkipDuplicates,
    ignoreAlreadyInQueue,
    setIgnoreAlreadyInQueue,
  } = useAppStore();

  const [internalActiveTab, setInternalActiveTab] = useState<PipelineTab>("input");
  const [presetItems, setPresetItems] = useState<PresetItem[]>([]);
  const [modelItems, setModelItems] = useState<ModelCatalogItem[]>([]);
  const [customPresetName, setCustomPresetName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [holeFillingEnabled, setHoleFillingEnabled] = useState(true);
  const [customAspectRatio, setCustomAspectRatio] = useState("16:9");
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [defaultExportDirectory] = useDefaultExportDirectory();
  const isTauri = useIsTauri();

  const activeTab = controlledActiveTab ?? internalActiveTab;
  const setActiveTab = onActiveTabChange ?? setInternalActiveTab;

  const reloadPresetItems = async () => {
    try {
      const items = await listPresets();
      const next = items.length ? items : FALLBACK_PRESETS;
      setPresetItems(next);
      return next;
    } catch {
      setPresetItems(FALLBACK_PRESETS);
      return FALLBACK_PRESETS;
    }
  };

  const reloadModelItems = async () => {
    try {
      const items = await listModelCatalog("cutout");
      setModelItems(items);
      return items;
    } catch {
      setModelItems([]);
      return [];
    }
  };

  useEffect(() => {
    let cancelled = false;
    void Promise.all([reloadPresetItems(), reloadModelItems()]).then(([presets]) => {
      if (cancelled) return;
      const current =
        presets.find((item) => item.id === activePreset) ??
        presets.find((item) => item.id === "quick_cutout") ??
        presets[0];
      if (!current) return;
      setActivePreset(current.id);
      setOptions(current.options);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const applyPreset = (presetId: string) => {
    const preset = presetItems.find((item) => item.id === presetId);
    if (!preset) return;
    setActivePreset(preset.id);
    setOptions(preset.options);
  };

  const selectedPreset = useMemo(
    () => presetItems.find((item) => item.id === activePreset),
    [activePreset, presetItems],
  );

  const saveCurrentPreset = async () => {
    const name = customPresetName.trim();
    const optionsPayload = { ...options, preset: activePreset };
    if (selectedPreset?.is_editable && !name) {
      const updated = await updatePreset(selectedPreset.id, { options: optionsPayload });
      setPresetItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setOptions(updated.options);
      setShowSaveInput(false);
      return;
    }
    if (!name) return;
    const created = await createPreset({ name, options: { ...optionsPayload, preset: "" } });
    await reloadPresetItems();
    setActivePreset(created.id);
    setOptions(created.options);
    setCustomPresetName("");
    setShowSaveInput(false);
  };

  const removeActivePreset = async () => {
    if (!selectedPreset?.is_editable) return;
    await deletePreset(selectedPreset.id);
    const items = await reloadPresetItems();
    const fallback = items.find((item) => item.id === "quick_cutout") ?? items[0];
    if (!fallback) return;
    setActivePreset(fallback.id);
    setOptions(fallback.options);
  };

  const presetOptions = presetItems.map((preset) => ({
    value: preset.id,
    label: preset.is_builtin ? preset.name : `✦ ${preset.name}`,
  }));

  const installedModelOptions = useMemo(() => {
    const installed: Array<{ value: string; label: string; hint: string; disabled?: boolean }> = modelItems
      .filter((item) => item.installed)
      .map((item) => ({
        value: item.id,
        label: item.name,
        hint: `${item.engine} · ${item.size_mb} MB`,
      }));
    if (options.cutout_model_id && !installed.some((item) => item.value === options.cutout_model_id)) {
      const current = modelItems.find((item) => item.id === options.cutout_model_id);
      if (current) {
        installed.unshift({
          value: current.id,
          label: `${current.name} (not installed)`,
          hint: "install",
          disabled: true,
        });
      }
    }
    return installed;
  }, [modelItems, options.cutout_model_id]);

  const postAspectMode =
    options.aspect_ratio === "keep" ? "keep" : options.aspect_ratio === "1:1" ? "square" : "custom";
  const isPngOutput = options.output_format === "png";
  const effectiveOutputDirectory = options.output_dir_override?.trim() || defaultExportDirectory || "";


  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden border-r border-white/[0.07] bg-[#0f0f12]", className)}>

      {/* ── Preset bar ────────────────────────────────────── */}
      <div className="border-b border-white/[0.07] px-3 pt-3 pb-2.5 space-y-2">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600">Preset</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <Select value={activePreset} options={presetOptions} onChange={applyPreset} />
          </div>
          <button
            type="button"
            onClick={() => setShowSaveInput((v) => !v)}
            title="Save preset"
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border transition-colors",
              showSaveInput
                ? "border-indigo-400/30 bg-indigo-500/12 text-indigo-300"
                : "border-white/[0.07] bg-white/[0.02] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200",
            )}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          {selectedPreset?.is_editable ? (
            <button
              type="button"
              onClick={() => void removeActivePreset()}
              title="Delete preset"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-white/[0.07] bg-white/[0.02] text-zinc-500 transition-colors hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        {showSaveInput ? (
          <div className="flex items-center gap-2">
            <Input
              value={customPresetName}
              onChange={(event) => setCustomPresetName(event.target.value)}
              placeholder={
                selectedPreset?.is_editable ? "Leave blank to update current" : "Name for new preset"
              }
              className="flex-1"
              autoFocus
            />
            <Button variant="secondary" className="h-8 shrink-0 px-3" onClick={() => void saveCurrentPreset()}>
              Save
            </Button>
          </div>
        ) : null}
      </div>

      {/* ── Tab bar ───────────────────────────────────────── */}
      {showLocalTabs ? (
        <div className="border-b border-white/[0.07] px-3 py-2">
          <div className="grid grid-cols-5 gap-1">
            {pipelineTabs.map((tab) => (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? "secondary" : "ghost"}
                size="sm"
                className="min-h-[36px] justify-center text-[11px]"
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.shortLabel}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="border-b border-white/[0.07] bg-[#0d0d10] px-3 py-2">
          <div className="grid grid-cols-5 gap-1">
            {pipelineTabs.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-label={tab.label}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "group relative flex min-h-[58px] flex-col items-center justify-between rounded-[9px] border px-1.5 py-2.5 transition-all",
                    isActive
                      ? "border-white/[0.1] bg-white/[0.05] text-zinc-100"
                      : "border-transparent text-zinc-500 hover:text-zinc-300",
                  )}
                >
                  <TabIcon
                    className={cn(
                      "h-3.5 w-3.5 transition-colors",
                      isActive ? tab.color : "text-inherit",
                    )}
                  />
                  <span className="text-[10px] font-medium leading-none tracking-[0.08em]">{tab.shortLabel}</span>
                  {isActive ? (
                    <span
                      className={cn(
                        "absolute bottom-0 left-1/2 h-[2px] w-4 -translate-x-1/2 translate-y-[1px] rounded-full",
                        tab.id === "input" && "bg-sky-400",
                        tab.id === "preprocess" && "bg-violet-400",
                        tab.id === "cutout" && "bg-rose-400",
                        tab.id === "postprocess" && "bg-amber-400",
                        tab.id === "export" && "bg-emerald-400",
                      )}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
          {/* Pipeline flow hint */}
          <div className="mt-2 flex items-center gap-1 overflow-hidden">
            {pipelineTabs.map((tab, i) => (
              <div key={tab.id} className="flex items-center gap-1 min-w-0">
                <span
                  className={cn(
                    "text-[9px] font-medium truncate",
                    activeTab === tab.id ? tab.color : "text-zinc-700",
                  )}
                >
                  {tab.shortLabel.toUpperCase()}
                </span>
                {i < pipelineTabs.length - 1 ? (
                  <ChevronRight className="h-2.5 w-2.5 shrink-0 text-zinc-700" />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab content ───────────────────────────────────── */}
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">

        {/* ── INPUT ── */}
        {activeTab === "input" ? (
          <>
            <Section title="Queue behavior">
              <div className="space-y-2">
                <CheckRow
                  label="Skip duplicates"
                  hint="Ignores files with identical content already in the queue."
                  checked={skipDuplicates}
                  onChange={setSkipDuplicates}
                  help={<HelpHint title="Skip duplicates" description="Compares file content fingerprint to avoid redundant processing." />}
                />
                <CheckRow
                  label="Ignore already in queue"
                  hint="Prevents adding the same source path twice."
                  checked={ignoreAlreadyInQueue}
                  onChange={setIgnoreAlreadyInQueue}
                  help={<HelpHint title="Ignore already in queue" description="Prevents adding the same source path multiple times to the queue." />}
                />
              </div>
            </Section>
            <Section title="Automation">
              <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.015] px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-zinc-200">Watch folders</p>
                    <p className="mt-1 text-[10px] leading-[1.5] text-zinc-500">
                      Already available. Use it when you want a folder to auto-enqueue new files into the normal batch pipeline.
                    </p>
                  </div>
                  {onOpenWatchFolders ? (
                    <Button variant="secondary" size="sm" onClick={onOpenWatchFolders}>
                      Configure
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.015] px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-zinc-200">Performance</p>
                    <p className="mt-1 text-[10px] leading-[1.5] text-zinc-500">
                      Open execution behavior and runtime defaults without leaving the workspace flow.
                    </p>
                  </div>
                  {onOpenPerformance ? (
                    <Button variant="secondary" size="sm" onClick={onOpenPerformance}>
                      Open
                    </Button>
                  ) : null}
                </div>
              </div>
            </Section>
          </>
        ) : null}

        {/* ── PREPROCESS ── */}
        {activeTab === "preprocess" ? (
          <>
            <Section title="Cleanup">
              <div className="space-y-2">
                <CheckRow
                  label="Denoise"
                  hint="Applies a light cleanup pass before segmentation."
                  checked={options.preprocess_denoise}
                  onChange={(checked) => setOptions({ preprocess_denoise: checked })}
                  help={<HelpHint title="Denoise" description="Reduces small pixel noise before the cutout model sees the image." />}
                  preview={<OptionPreview name="denoise" alt="Detail shown noisy, then smoothed" />}
                />
                <CheckRow
                  label="Color normalization"
                  hint="Balances contrast and tonal range before cutout."
                  checked={options.preprocess_color_normalization}
                  onChange={(checked) => setOptions({ preprocess_color_normalization: checked })}
                  help={<HelpHint title="Color normalization" description="Normalizes the image tonal range to help with inconsistent lighting and low contrast assets." />}
                />
                <CheckRow
                  label="Sharpening"
                  hint="Adds a light local sharpen pass before cutout."
                  checked={options.preprocess_sharpening}
                  onChange={(checked) => setOptions({ preprocess_sharpening: checked })}
                  help={<HelpHint title="Sharpening" description="Applies a mild unsharp mask before cutout to clarify soft edges." />}
                  preview={<OptionPreview name="sharpen" alt="Detail shown soft, then sharpened" />}
                />
              </div>
            </Section>
            <Section title="AI upscale">
              <ToggleCard
                label="Enable AI upscale"
                hint="Runs lightweight local upscale either before or after cutout."
                checked={options.enhance_level !== "off"}
                onChange={(checked) => setOptions({ enhance_level: checked ? "2x" : "off" })}
                help={<HelpHint title="Enable AI upscale" description="Turns the lightweight local upscale pass on or off. You can place it before or after cutout." />}
                accent
              />
              <div
                className={cn(
                  "space-y-3 transition-opacity",
                  options.enhance_level === "off" ? "pointer-events-none opacity-40" : "opacity-100",
                )}
              >
                <Field
                  label="Runtime"
                  help={<HelpHint title="Enhance runtime" description="Current local runtime used for AI upscale. Model-specific runtimes will plug into this later." />}
                >
                  <Select
                    value={options.enhance_engine}
                    options={enhanceEngineOptions}
                    onChange={(value) =>
                      setOptions({ enhance_engine: value as ProcessingOptions["enhance_engine"] })
                    }
                  />
                </Field>
                <Field
                  label="Placement"
                  hint="Choose whether upscale happens before or after background removal."
                  help={<HelpHint title="Placement" description="Run AI upscale before cutout to help the model see more detail, or after cutout to upscale the isolated result." />}
                >
                  <Select
                    value={options.processing_order ?? "cutout_then_enhance"}
                    options={enhanceStageOptions}
                    onChange={(value) =>
                      setOptions({ processing_order: value as NonNullable<ProcessingOptions["processing_order"]> })
                    }
                  />
                </Field>
                <Field
                  label="Scale"
                  hint="Model-backed upscale levels will expand here later."
                  help={<HelpHint title="Scale" description="Current lightweight local upscale supports 2x or 4x." />}
                >
                  <Select
                    value={options.enhance_level}
                    options={enhanceStrengthOptions}
                    onChange={(value) => setOptions({ enhance_level: value as ProcessingOptions["enhance_level"] })}
                  />
                </Field>
              </div>
            </Section>
          </>
        ) : null}

        {/* ── CUTOUT ── */}
        {activeTab === "cutout" ? (
          <>
            <Section title="Background removal">
              <Field
                label="Model"
                hint="The selected model determines the underlying runtime family."
                help={<HelpHint title="Model selector" description="Chooses the cutout model directly. The engine is inferred from that model, so the workspace stays simpler." />}
              >
                <Select
                  value={options.cutout_model_id}
                  options={installedModelOptions}
                  onChange={(value) =>
                    setOptions({
                      cutout_model_id: value,
                      local_model: value,
                      cutout_engine: "rembg",
                    })
                  }
                />
                {!installedModelOptions.length ? (
                  <p className="mt-1.5 rounded-[8px] border border-amber-500/20 bg-amber-500/[0.07] px-2.5 py-2 text-[11px] text-amber-300">
                    No cutout models installed. Go to <strong>Settings → Models</strong> to install one.
                  </p>
                ) : null}
              </Field>
              <Field
                label="Quality preset"
                hint="Balances speed and edge accuracy."
                help={<HelpHint title="Quality preset" description="Balances cutout speed and edge quality. Best enables alpha matting, which is what recovers hair and fur." />}
                preview={<OptionPreview name="cutout-quality" alt="The same fur edge cut at Balanced and at Best quality" />}
              >
                <Select
                  value={mapQualityToUi(options.local_quality_preset)}
                  options={qualityPresetOptions}
                  onChange={(value) => setOptions({ local_quality_preset: mapQualityFromUi(value) })}
                />
              </Field>
            </Section>

            <Section title="Mask cleanup">
              <div className="space-y-2">
                <CheckRow
                  label="Drop faint pixels"
                  hint="Clears near-transparent specks left around the subject. Too strong eats hair."
                  checked={options.alpha_threshold > 0}
                  onChange={(checked) => setOptions({ alpha_threshold: checked ? 10 : 0 })}
                  help={<HelpHint title="Drop faint pixels" description="Forces alpha below the threshold to fully transparent. This is a hard cut, not alpha matting - for hair and fur set Quality preset to Best." />}
                />
                <CheckRow
                  label="Remove mask artifacts"
                  hint="Reduces white halos left by segmentation."
                  checked={options.white_halo_cleanup > 0}
                  onChange={(checked) => setOptions({ white_halo_cleanup: checked ? 35 : 0 })}
                  help={<HelpHint title="Remove mask artifacts" description="Darkens the light fringe segmentation leaves where the subject met a bright background. The change is a pixel or two wide, so judge it on a real result rather than a thumbnail." />}
                />
                <CheckRow
                  label="Hole filling"
                  hint="Fills enclosed transparent gaps inside the subject."
                  checked={holeFillingEnabled}
                  onChange={setHoleFillingEnabled}
                  help={<HelpHint title="Hole filling" description="Future cleanup pass to fill enclosed transparent gaps in the subject mask." />}
                />
                <CheckRow
                  label="Edge feathering"
                  hint="Softens hard mask edges for smoother composites."
                  checked={options.edge_feather_radius > 0}
                  onChange={(checked) => setOptions({ edge_feather_radius: checked ? 1 : 0 })}
                  help={<HelpHint title="Edge feathering" description="Softens hard edges around the mask for smoother composites." />}
                  preview={<OptionPreview name="edge-feather" alt="A cutout edge shown hard, then softened" />}
                />
              </div>
            </Section>
          </>
        ) : null}

        {/* ── POSTPROCESS ── */}
        {activeTab === "postprocess" ? (
          <>
            <Section title="Canvas">
              <ToggleCard
                label="Trim transparent bounds"
                hint="Crops empty transparent margins after cutout."
                checked={options.trim_transparent_bounds}
                onChange={(checked) => setOptions({ trim_transparent_bounds: checked })}
                preview={<OptionPreview name="trim-bounds" alt="The same cutout before and after cropping its empty margins" />}
                help={<HelpHint title="Trim transparent bounds" description="Removes transparent margins after cutout before resizing and export." />}
              />
              <Field
                label="Size behavior"
                help={<HelpHint title="Size behavior" description="Keeps original dimensions or enables custom canvas sizing." />}
              >
                <Select
                  value={options.resize_mode}
                  options={resizeModeOptions}
                  onChange={(value) =>
                    setOptions({ resize_mode: value as ProcessingOptions["resize_mode"] })
                  }
                />
              </Field>
              {options.resize_mode === "custom" ? (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Max width" help={<HelpHint title="Max width" description="Maximum width in pixels." />}>
                    <Input
                      value={options.resize_max_width ?? ""}
                      onChange={(event) =>
                        setOptions({
                          resize_max_width: event.target.value ? Number(event.target.value) : null,
                        })
                      }
                      placeholder="e.g. 1600"
                    />
                  </Field>
                  <Field label="Max height" help={<HelpHint title="Max height" description="Maximum height in pixels." />}>
                    <Input
                      value={options.resize_max_height ?? ""}
                      onChange={(event) =>
                        setOptions({
                          resize_max_height: event.target.value ? Number(event.target.value) : null,
                        })
                      }
                      placeholder="e.g. 1600"
                    />
                  </Field>
                </div>
              ) : null}
              <Field
                label="Aspect ratio"
                help={<HelpHint title="Aspect ratio" description="Defines the target framing ratio in postprocess." />}
              >
                <Select
                  value={postAspectMode}
                  options={postAspectOptions}
                  onChange={(value) => {
                    if (value === "keep") { setOptions({ aspect_ratio: "keep" }); return; }
                    if (value === "square") { setOptions({ aspect_ratio: "1:1" }); return; }
                    setOptions({ aspect_ratio: customAspectRatio || "16:9" });
                  }}
                />
              </Field>
              {postAspectMode === "custom" ? (
                <Field label="Custom ratio" help={<HelpHint title="Custom ratio" description="Use format like 16:9, 9:16 or 3:2." />}>
                  <Input
                    value={customAspectRatio}
                    onChange={(event) => {
                      const next = event.target.value;
                      setCustomAspectRatio(next);
                      setOptions({ aspect_ratio: next || "16:9" });
                    }}
                    placeholder="16:9"
                  />
                </Field>
              ) : null}
              <Field
                label="Padding"
                hint="Pixels of transparent margin added around the subject."
                help={<HelpHint title="Padding" description="Adds transparent or solid margin around the processed subject." />}
              >
                <Input
                  value={options.padding}
                  onChange={(event) =>
                    setOptions({ padding: event.target.value ? Number(event.target.value) : 0 })
                  }
                  placeholder="0"
                />
              </Field>
            </Section>

            <Section title="Background">
              <Field
                label="Mode"
                help={<HelpHint title="Background" description="Chooses transparent output or a solid background color." />}
                preview={<OptionPreview name="solid-bg" alt="A cutout on transparency, then on a solid colour" />}
              >
                <Select
                  value={options.background_mode}
                  options={backgroundOptions}
                  onChange={(value) =>
                    setOptions({ background_mode: value as ProcessingOptions["background_mode"] })
                  }
                />
              </Field>
              {options.background_mode === "solid" ? (
                <Field label="Color" help={<HelpHint title="Solid color" description="Hex color used when solid background mode is selected." />}>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-8 w-8 shrink-0 rounded-[7px] border border-white/[0.1]"
                      style={{ backgroundColor: options.background_color || "#ffffff" }}
                    />
                    <Input
                      value={options.background_color}
                      onChange={(event) => setOptions({ background_color: event.target.value })}
                      placeholder="#FFFFFF"
                      className="flex-1"
                    />
                  </div>
                </Field>
              ) : null}
            </Section>

            <FuturePill items={["Drop shadow", "Reflections", "Vignette", "Bloom"]} />
          </>
        ) : null}

        {/* ── EXPORT ── */}
        {activeTab === "export" ? (
          <>
            <Section title="File generation">
              <Field
                label="Format"
                help={<HelpHint title="Export format" description="Defines the output file format for final generated files." />}
              >
                <div className="grid grid-cols-4 gap-1">
                  {exportFormatOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setOptions({ output_format: opt.value as ProcessingOptions["output_format"] })
                      }
                      className={cn(
                        "rounded-[8px] border py-2 text-[11px] font-medium transition-colors",
                        (options.output_format === "jpg" ? "jpeg" : options.output_format) === opt.value
                          ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                          : "border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[10px] text-zinc-600">
                  {isPngOutput ? "PNG is lossless — quality slider is disabled." : "Quality applies to JPEG, WebP and AVIF."}
                </p>
              </Field>

              <Field
                label="Quality"
                help={<HelpHint title="Quality" description="Compression quality for lossy formats. PNG ignores this value." />}
              >
                <div className={cn("flex items-center gap-3", isPngOutput && "opacity-40 pointer-events-none")}>
                  <Slider
                    value={options.quality}
                    min={1}
                    max={100}
                    onValueChange={(value) => setOptions({ quality: value })}
                    disabled={isPngOutput}
                    className="flex-1"
                  />
                  <span className="w-7 shrink-0 text-right font-mono text-[11px] tabular-nums text-zinc-400">
                    {options.quality}
                  </span>
                </div>
              </Field>

              <Field
                label="Output directory"
                hint="Leave blank to use the app default export directory. If no app default is configured, the backend output root is used."
                help={<HelpHint title="Output directory" description="Selects where exported files are written." />}
              >
                <div className="space-y-2">
                  <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
                    <Input
                      value={options.output_dir_override ?? ""}
                      onChange={(event) => setOptions({ output_dir_override: event.target.value || null })}
                      placeholder={defaultExportDirectory || "Use app default / backend default"}
                    />
                    <Button
                      variant="secondary"
                      disabled={!isTauri}
                      onClick={async () => {
                        const path = await pickDirectoryPath();
                        if (!path) return;
                        setOptions({ output_dir_override: path });
                      }}
                    >
                      Browse
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setOptions({ output_dir_override: null })}>
                      Use app default
                    </Button>
                    <span className="text-[10px] text-zinc-600">
                      {effectiveOutputDirectory ? `Resolved: ${effectiveOutputDirectory}` : "Resolved: backend output root"}
                    </span>
                  </div>
                </div>
              </Field>

              <ToggleCard
                label="Overwrite existing"
                hint="Replace files when name collisions occur."
                checked={overwriteExisting}
                onChange={setOverwriteExisting}
                help={<HelpHint title="Overwrite existing" description="If enabled, existing files with the same name are replaced during export." />}
              />
            </Section>

            <Section title="Naming rules">
              <Field
                label="Template pattern"
                help={<HelpHint title="Template pattern" description="Pattern used to generate output file names." />}
              >
                <Input
                  value={options.filename_pattern}
                  onChange={(event) =>
                    setOptions({ filename_pattern: event.target.value, naming_mode: "pattern" })
                  }
                  placeholder="{name}_{index}_{model}"
                />
              </Field>
              <Field
                label="Tokens"
                hint="Click to append to the pattern."
                help={<HelpHint title="Tokens" description="Insert dynamic values into naming templates." />}
              >
                <div className="flex flex-wrap gap-1.5">
                  {templateTokens.map((token) => (
                    <button
                      key={token}
                      type="button"
                      onClick={() =>
                        setOptions({
                          filename_pattern: `${options.filename_pattern}${token}`,
                          naming_mode: "pattern",
                        })
                      }
                      className="rounded-[5px] border border-white/[0.08] bg-white/[0.03] px-2 py-1 font-mono text-[10px] text-zinc-400 transition-colors hover:border-emerald-400/25 hover:bg-emerald-500/[0.08] hover:text-emerald-300"
                    >
                      {token}
                    </button>
                  ))}
                </div>
              </Field>
            </Section>

            <FuturePill items={["OCR naming", "AI tagging", "Dataset export", "ZIP archive"]} />
          </>
        ) : null}
      </div>
    </div>
  );
}
