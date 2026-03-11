"use client";

import { useEffect, useId, useMemo, useState, type ComponentType, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ChevronDown, Cpu, GitBranch, Grid2x2, Image, Info, Layers3, SlidersHorizontal, Sparkles, Tags } from "lucide-react";
import { Button, Checkbox, Collapsible, CollapsibleContent, CollapsibleTrigger, Input, Select, Slider, Switch } from "@/components/ui";
import { presets, useAppStore } from "@/stores/use-app-store";
import { cn } from "@/lib/utils";
import type { ProcessingOptions } from "@/types";

type SettingsTab = "general" | "naming" | "presets" | "batch";
type SavedPreset = {
  id: string;
  name: string;
  options: ProcessingOptions;
};

type Props = {
  activeTab?: SettingsTab;
  onActiveTabChange?: (tab: SettingsTab) => void;
  showLocalTabs?: boolean;
  className?: string;
};

const CUSTOM_PRESETS_KEY = "ipu.custom-presets";
const workspaceTabs: Array<{
  id: SettingsTab;
  label: string;
  icon: ComponentType<{ className?: string }>;
  description: string;
}> = [
  { id: "general", label: "General", icon: Grid2x2, description: "Workflow and export settings" },
  { id: "naming", label: "Naming", icon: Tags, description: "Output naming and destination" },
  { id: "presets", label: "Presets", icon: Layers3, description: "Built-in and custom presets" },
  { id: "batch", label: "Batch", icon: SlidersHorizontal, description: "Queue behavior and workers" },
];

const formatOptions = [
  { value: "png", label: "PNG — lossless", dotColor: "#6366f1", hint: "lossless", group: "Raster" },
  { value: "webp", label: "WebP — lossy / lossless", dotColor: "#10b981", hint: "hybrid", group: "Raster" },
  { value: "jpeg", label: "JPEG — lossy", dotColor: "#f59e0b", hint: "lossy", group: "Raster" },
  { value: "avif", label: "AVIF — next-gen", dotColor: "#8b5cf6", hint: "next-gen", group: "Raster" },
];

const backgroundOptions = [
  { value: "transparent", label: "Transparent" },
  { value: "solid", label: "Solid color" },
];

const resizeModeOptions = [
  { value: "keep", label: "Keep size" },
  { value: "custom", label: "Custom size" },
];

const aspectRatioOptions = [
  { value: "keep", label: "Keep image" },
  { value: "1:1", label: "1:1 Square" },
  { value: "4:5", label: "4:5 Portrait" },
  { value: "3:2", label: "3:2 Landscape" },
  { value: "16:9", label: "16:9 Widescreen" },
  { value: "9:16", label: "9:16 Story" },
  { value: "2:3", label: "2:3 Portrait" },
];

const qualityPresetOptions = [
  { value: "fast", label: "Fast", hint: "speed", group: "Profile" },
  { value: "balanced", label: "Balanced", hint: "default", group: "Profile" },
  { value: "hq", label: "HQ", hint: "best edges", group: "Profile" },
];

const workflowModeOptions = [
  { value: "cutout_only", label: "Cutout only", hint: "default", group: "Workflow" },
  { value: "enhance_only", label: "Enhance only", hint: "quality", group: "Workflow" },
  { value: "cutout_enhance", label: "Cutout + Enhance", hint: "combined", group: "Workflow" },
];

const processingOrderOptions = [
  { value: "cutout_then_enhance", label: "Cutout -> Enhance", hint: "assets", group: "Order" },
  { value: "enhance_then_cutout", label: "Enhance -> Cutout", hint: "small images", group: "Order" },
];

const enhanceLevelOptions = [
  { value: "off", label: "Off", hint: "disabled", group: "Enhance" },
  { value: "2x", label: "2x", hint: "balanced", group: "Enhance" },
  { value: "4x", label: "4x", hint: "heavy", group: "Enhance" },
];

const enhanceEngineOptions = [
  { value: "realesrgan", label: "Real-ESRGAN", hint: "local", group: "Engine" },
];

const namingOutputOptions = [
  { value: "alongside", label: "Alongside source" },
  { value: "subfolder", label: "Subfolder /output" },
  { value: "custom", label: "Custom path…" },
];

const namingModeOptions = [
  { value: "pattern", label: "Template pattern", hint: "custom" },
  { value: "ocr_text", label: "OCR text (Tesseract)", hint: "image text" },
  { value: "keep_original", label: "Keep original", hint: "as-is" },
];

const presetLabelMap: Record<string, string> = {
  quick_cutout: "Quick cutout",
  product_image: "Product image",
  portrait: "Portrait",
  anime_art: "Anime / art",
  convert_only: "Convert only",
  remove_trim_webp: "Remove + trim + WebP",
};

const quickSwatches = ["#ffffff", "#000000", "#1a1a2e", "#2d1b69", "#14532d", "#e8d5b7", "#a8d8ea"];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-white/[0.07] px-4 py-4 last:border-b-0">
      <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-500">{title}</p>
      {children}
    </section>
  );
}

function InfoPopover({
  title,
  description,
  whenToUse,
}: {
  title: string;
  description: string;
  whenToUse?: string;
}) {
  return (
    <details className="group relative">
      <summary className="list-none cursor-pointer text-zinc-500 transition-colors hover:text-zinc-300">
        <Info className="h-3.5 w-3.5" />
      </summary>
      <div className="absolute right-0 top-5 z-[40] w-[250px] rounded-[10px] border border-white/[0.08] bg-[#17171d] p-3 shadow-[0_14px_36px_rgba(0,0,0,0.55)]">
        <p className="text-[12px] font-semibold text-zinc-100">{title}</p>
        <p className="mt-1 text-[11px] leading-5 text-zinc-400">{description}</p>
        {whenToUse ? <p className="mt-2 border-t border-white/[0.08] pt-2 text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-500">{whenToUse}</p> : null}
      </div>
    </details>
  );
}

function Field({ label, children, info }: { label: string; children: ReactNode; info?: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-[11px] font-medium text-zinc-400">{label}</label>
        {info}
      </div>
      {children}
    </div>
  );
}

function CollapsibleSection({
  title,
  description,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <section className="overflow-visible rounded-[14px] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
        <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-white/[0.07] bg-[#16161a] text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-[var(--text)]">{title}</p>
              <p className="truncate text-[11px] text-[var(--muted)]">{description}</p>
            </div>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--muted)] transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-visible border-t border-white/[0.07] px-4 pb-4 pt-3 data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
          {children}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return <Switch checked={checked} onCheckedChange={onChange} />;
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  const handleToggle = () => onChange(!checked);
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onChange(!checked);
  };

  return (
    <div className="flex items-center gap-2 text-left text-[12px] text-zinc-300">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(Boolean(value))} />
      <span
        role="button"
        tabIndex={0}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        className="cursor-pointer select-none"
      >
        {label}
      </span>
    </div>
  );
}

export function JobSettingsPanel({
  activeTab: controlledActiveTab,
  onActiveTabChange,
  showLocalTabs = true,
  className,
}: Props) {
  const { options, setOptions, activePreset, setActivePreset, skipDuplicates, setSkipDuplicates } = useAppStore();
  const [internalActiveTab, setInternalActiveTab] = useState<SettingsTab>("general");
  const [customPresets, setCustomPresets] = useState<SavedPreset[]>([]);
  const [customPresetName, setCustomPresetName] = useState("");
  const [parallelWorkersEnabled, setParallelWorkersEnabled] = useState(true);
  const [workerCount, setWorkerCount] = useState(3);
  const [outputDirMode, setOutputDirMode] = useState("alongside");
  const activeTab = controlledActiveTab ?? internalActiveTab;
  const setActiveTab = onActiveTabChange ?? setInternalActiveTab;

  useEffect(() => {
    const raw = window.localStorage.getItem(CUSTOM_PRESETS_KEY);
    if (!raw) return;
    try {
      setCustomPresets(JSON.parse(raw));
    } catch {
      setCustomPresets([]);
    }
  }, []);

  const persistCustomPresets = (nextPresets: SavedPreset[]) => {
    setCustomPresets(nextPresets);
    window.localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(nextPresets));
  };

  const saveCurrentPreset = () => {
    const name = customPresetName.trim();
    if (!name) return;
    const nextPresets = [
      ...customPresets.filter((preset) => preset.name !== name),
      { id: crypto.randomUUID(), name, options: { ...options, preset: name } },
    ];
    persistCustomPresets(nextPresets);
    setCustomPresetName("");
    setActivePreset(name);
  };

  const removeCustomPreset = (id: string) => {
    persistCustomPresets(customPresets.filter((preset) => preset.id !== id));
  };

  const applyPreset = (name: string) => {
    const presetOptions = presets[name];
    if (!presetOptions) return;
    setActivePreset(name);
    setOptions({ ...presetOptions, preset: name });
  };

  const namingPreview = useMemo(() => {
    if (options.naming_mode === "keep_original") return "product-hero-01.png";
    if (options.naming_mode === "ocr_text") return "detected_text_from_image.png";
    return options.filename_pattern
      .replace("{original_name}", "product-hero-01")
      .replace("{name}", "product-hero-01")
      .replace("{preset}", options.preset)
      .replace("{engine}", options.local_model)
      .replace("{model}", options.local_model)
      .replace("{ext}", options.output_format)
      .replace("{date}", "20260309")
      .replace("{index}", "001")
      .replace("{width}", "1600")
      .replace("{height}", "1200")
      .replace("{sequence}", "001");
  }, [options]);

  const templateTokens = ["{name}", "{ext}", "{date}", "{index}", "{width}", "{height}", "{model}"];
  const workflowMode = options.workflow_mode ?? "cutout_only";
  const usesCutout = workflowMode === "cutout_only" || workflowMode === "cutout_enhance";
  const usesEnhance = workflowMode === "enhance_only" || workflowMode === "cutout_enhance";
  const isPngOutput = options.output_format === "png";
  const showResizeControls = options.resize_mode === "custom";
  const showQuickColors = options.background_mode === "solid";

  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden border-r border-white/[0.08] bg-[#111114]", className)}>
      {showLocalTabs ? (
        <div className="border-b border-white/[0.07] px-4 py-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-100">ClearCut</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">Image processing</p>
          <div className="mt-4 flex gap-1">
            {workspaceTabs.map((tab) => (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? "secondary" : "ghost"}
                size="sm"
                className="flex-1"
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {!showLocalTabs ? (
        <div className="border-b border-white/[0.07] bg-[#101013] px-3 py-2">
          <div className="flex items-center gap-1.5">
            {workspaceTabs.map((tab, index) => {
              const TabIcon = tab.icon;
              const isLeftAnchored = index <= 1;
              const isRightAnchored = index >= workspaceTabs.length - 2;
              return (
                <div key={tab.id} className="group relative">
                  <button
                    type="button"
                    aria-label={tab.label}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-[7px] border transition-colors",
                      activeTab === tab.id
                        ? "border-indigo-400/28 bg-indigo-500/14 text-indigo-300"
                        : "border-white/[0.06] bg-white/[0.02] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200",
                    )}
                  >
                    <TabIcon className="h-3.5 w-3.5" />
                  </button>
                  <div
                    className={cn(
                      "pointer-events-none absolute top-[calc(100%+7px)] z-40 w-[168px] rounded-[8px] border border-white/[0.08] bg-[#17171d] px-2 py-1 text-[10px] text-zinc-300 opacity-0 shadow-[0_10px_28px_rgba(0,0,0,0.45)] transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
                      isLeftAnchored && "left-0",
                      isRightAnchored && "right-0",
                      !isLeftAnchored && !isRightAnchored && "left-1/2 -translate-x-1/2",
                    )}
                  >
                    <p className="font-medium text-zinc-100">{tab.label}</p>
                    <p className="mt-0.5 text-zinc-500">{tab.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === "general" ? (
          <div className="space-y-3 p-3">
            <CollapsibleSection title="Workflow" description="Choose the processing path for each job" icon={GitBranch}>
              <div className="space-y-3">
                <Field
                  label="Mode"
                  info={
                    <InfoPopover
                      title="Workflow mode"
                      description="Defines if the pipeline runs cutout, enhance, or both for each image."
                      whenToUse="Choose based on your target output."
                    />
                  }
                >
                  <Select
                    value={workflowMode}
                    options={workflowModeOptions}
                    onChange={(value) => {
                      const nextMode = value as ProcessingOptions["workflow_mode"];
                      const nextPatch: Partial<ProcessingOptions> = {
                        workflow_mode: nextMode,
                        remove_background: nextMode !== "enhance_only",
                      };
                      if (nextMode === "enhance_only" && options.enhance_level === "off") {
                        nextPatch.enhance_level = "2x";
                      }
                      setOptions(nextPatch);
                    }}
                  />
                </Field>
                {workflowMode === "cutout_only" ? (
                  <p className="text-[11px] text-zinc-500">Remove the background and export the result.</p>
                ) : null}
                {workflowMode === "enhance_only" ? (
                  <p className="text-[11px] text-zinc-500">Improve image quality without removing the background.</p>
                ) : null}
                {workflowMode === "cutout_enhance" ? (
                  <>
                    <p className="text-[11px] text-zinc-500">Remove the background and also enhance the final image.</p>
                    <Field
                      label="Processing order"
                      info={
                        <InfoPopover
                          title="Processing order"
                          description="Defines whether enhance runs before or after cutout when both are active."
                          whenToUse="Use cutout first for transparent assets; enhance first for small/blurry sources."
                        />
                      }
                    >
                      <Select
                        value={options.processing_order ?? "cutout_then_enhance"}
                        options={processingOrderOptions}
                        onChange={(value) => setOptions({ processing_order: value as ProcessingOptions["processing_order"] })}
                      />
                    </Field>
                  </>
                ) : null}
              </div>
            </CollapsibleSection>

            {usesCutout ? (
              <CollapsibleSection title="Cutout" description="Quality profile and mask cleanup settings" icon={Cpu}>
                <div className="space-y-3">
                  <Field
                    label="Quality preset"
                    info={
                      <InfoPopover
                        title="Quality preset"
                        description="Fast is quickest, Balanced is best default, HQ improves fine edges with higher cost."
                        whenToUse="Pick HQ for hair/fur, Fast for speed-focused batches."
                      />
                    }
                  >
                    <Select
                      value={options.local_quality_preset ?? "balanced"}
                      options={qualityPresetOptions}
                      onChange={(value) => {
                        setOptions({
                          local_quality_preset: value as "fast" | "balanced" | "hq",
                          provider_priority: ["rembg_local", "simple_cv_local", "remove_bg_api"],
                        });
                      }}
                    />
                  </Field>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <CheckRow checked={options.edge_feather_radius > 0} onChange={(checked) => setOptions({ edge_feather_radius: checked ? 1 : 0 })} label="Alpha matting" />
                      <InfoPopover title="Alpha matting" description="Improves translucent edges like hair and fur. Costs more processing time." whenToUse="Enable when edge quality matters most." />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <CheckRow checked={options.white_halo_cleanup > 0} onChange={(checked) => setOptions({ white_halo_cleanup: checked ? 35 : 0 })} label="Post-process mask" />
                      <InfoPopover title="Post-process mask" description="Cleans mask artifacts and reduces white halos around subjects." whenToUse="Keep enabled for product cutouts and portraits." />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <CheckRow checked={options.trim_transparent_bounds} onChange={(checked) => setOptions({ trim_transparent_bounds: checked })} label="Auto-crop output" />
                      <InfoPopover title="Auto-crop output" description="Trims transparent margins around the subject before export." whenToUse="Disable if you need original frame/canvas size." />
                    </div>
                  </div>
                </div>
              </CollapsibleSection>
            ) : null}

            {usesEnhance ? (
              <CollapsibleSection title="Enhance" description="Optional AI upscale and detail enhancement" icon={Sparkles} defaultOpen={false}>
                <div className="space-y-3">
                  <Field
                    label="Enhance"
                    info={
                      <InfoPopover
                        title="Enhance"
                        description="Upscales and sharpens detail before export. Higher levels are slower and use more memory."
                        whenToUse="Use 2x for most cases and 4x only for high-detail outputs."
                      />
                    }
                  >
                    <Select
                      value={options.enhance_level}
                      options={enhanceLevelOptions}
                      onChange={(value) => setOptions({ enhance_level: value as ProcessingOptions["enhance_level"] })}
                    />
                  </Field>
                  <Field label="Engine">
                    <Select
                      value={options.enhance_engine}
                      options={enhanceEngineOptions}
                      onChange={(value) => setOptions({ enhance_engine: value as ProcessingOptions["enhance_engine"] })}
                    />
                  </Field>
                </div>
              </CollapsibleSection>
            ) : null}

            <CollapsibleSection title="Export" description="File format, transparency and export compression" icon={Image}>
              <div className="space-y-3">
                <Field label="Format">
                  <Select
                    value={options.output_format}
                    options={formatOptions}
                    onChange={(value) => setOptions({ output_format: value as ProcessingOptions["output_format"] })}
                  />
                </Field>
                <Field label="Quality">
                  <div className={cn("flex items-center gap-2", isPngOutput && "opacity-55")}>
                    <Slider value={options.quality} min={1} max={100} onValueChange={(value) => setOptions({ quality: value })} disabled={isPngOutput} />
                    <span className="w-7 text-right font-mono text-[10px] text-zinc-500">{options.quality}</span>
                  </div>
                  {isPngOutput ? <p className="mt-1 text-[10px] text-zinc-500">PNG is lossless. Quality applies to JPEG, WebP and AVIF.</p> : null}
                </Field>
                <Field
                  label="Background mode"
                  info={
                    <InfoPopover
                      title="Background mode"
                      description="Transparent keeps alpha. Solid fills the background color during export."
                      whenToUse="Use transparent for assets; solid for social, e-commerce and prints."
                    />
                  }
                >
                  <Select
                    value={options.background_mode}
                    options={backgroundOptions}
                    onChange={(value) => setOptions({ background_mode: value as ProcessingOptions["background_mode"] })}
                  />
                </Field>
                {showQuickColors ? (
                  <Field label="Quick colors">
                    <div className="flex flex-wrap gap-1.5">
                      {quickSwatches.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setOptions({ background_color: color, background_mode: "solid" })}
                          className={cn(
                            "h-[22px] w-[22px] appearance-none rounded-[5px] border-2 border-transparent transition-transform hover:scale-105",
                            options.background_color.toLowerCase() === color.toLowerCase() && options.background_mode === "solid" && "border-white/60",
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </Field>
                ) : null}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Resize & Canvas" description="Resize behavior and output framing" icon={Image} defaultOpen={false}>
              <div className="space-y-3">
                <Field label="Size">
                  <Select
                    value={options.resize_mode}
                    options={resizeModeOptions}
                    onChange={(value) => setOptions({ resize_mode: value as ProcessingOptions["resize_mode"] })}
                  />
                </Field>
                {showResizeControls ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Max width">
                        <Input
                          value={options.resize_max_width ?? ""}
                          onChange={(event) => setOptions({ resize_max_width: event.target.value ? Number(event.target.value) : null })}
                          placeholder="None"
                        />
                      </Field>
                      <Field label="Max height">
                        <Input
                          value={options.resize_max_height ?? ""}
                          onChange={(event) => setOptions({ resize_max_height: event.target.value ? Number(event.target.value) : null })}
                          placeholder="None"
                        />
                      </Field>
                    </div>
                    <Field
                      label="Aspect ratio"
                      info={
                        <InfoPopover
                          title="Aspect ratio"
                          description="Controls final framing ratio when custom size is active."
                          whenToUse="Use this to target social formats like 1:1, 4:5 or 9:16."
                        />
                      }
                    >
                      <Select
                        value={options.aspect_ratio}
                        options={aspectRatioOptions}
                        onChange={(value) => setOptions({ aspect_ratio: value })}
                      />
                    </Field>
                  </>
                ) : (
                  <p className="text-[11px] text-zinc-500">Set size to Custom to enable aspect ratio and max dimensions.</p>
                )}
              </div>
            </CollapsibleSection>

          </div>
        ) : null}

        {activeTab === "naming" ? (
          <>
            <Section title="Output name">
              <div className="space-y-3">
                <Field label="Mode">
                  <Select
                    value={options.naming_mode}
                    options={namingModeOptions}
                    onChange={(value) => setOptions({ naming_mode: value as ProcessingOptions["naming_mode"] })}
                  />
                </Field>
                <Field label="Template">
                  <Input
                    value={options.filename_pattern}
                    onChange={(event) => setOptions({ filename_pattern: event.target.value })}
                    disabled={options.naming_mode !== "pattern"}
                  />
                </Field>
                {options.naming_mode === "ocr_text" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="OCR language">
                      <Input
                        value={options.ocr_language}
                        onChange={(event) => setOptions({ ocr_language: event.target.value || "eng" })}
                        placeholder="eng"
                      />
                    </Field>
                    <Field label="Max length">
                      <Input
                        value={options.ocr_max_length}
                        onChange={(event) => setOptions({ ocr_max_length: event.target.value ? Number(event.target.value) : 48 })}
                        placeholder="48"
                      />
                    </Field>
                  </div>
                ) : null}
                <div className="rounded-[9px] border border-white/[0.07] bg-[#16161a] px-3 py-2 font-mono text-[11px]">
                  <span className="mr-2 text-[9px] uppercase tracking-[0.12em] text-zinc-500">Preview</span>
                  <span className="text-indigo-300">{namingPreview}</span>
                </div>
                <Field label="Tokens">
                  <div className="flex flex-wrap gap-1.5">
                    {templateTokens.map((token) => (
                      <button
                        key={token}
                        type="button"
                        onClick={() => {
                          if (options.naming_mode !== "pattern") {
                            setOptions({ naming_mode: "pattern", filename_pattern: `${options.filename_pattern}${token}` });
                            return;
                          }
                          setOptions({ filename_pattern: `${options.filename_pattern}${token}` });
                        }}
                        className="rounded-[4px] border border-white/[0.07] bg-white/[0.05] px-2 py-1 font-mono text-[10px] text-zinc-300 transition-colors hover:border-indigo-400/30 hover:bg-indigo-500/10 hover:text-indigo-300"
                      >
                        {token}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
            </Section>

            <Section title="Output directory">
              <div className="space-y-3">
                <Select value={outputDirMode} options={namingOutputOptions} onChange={setOutputDirMode} />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-zinc-400">Overwrite existing</span>
                  <Toggle checked={false} onChange={() => undefined} />
                </div>
              </div>
            </Section>
          </>
        ) : null}

        {activeTab === "presets" ? (
          <>
            <Section title="Saved presets">
              <div className="space-y-1.5">
                {Object.entries(presetLabelMap).map(([presetName, label]) => (
                  <div
                    key={presetName}
                    className={cn(
                      "flex items-center gap-2 rounded-[9px] border px-3 py-2",
                      activePreset === presetName
                        ? "border-indigo-400/30 bg-indigo-500/12"
                        : "border-white/[0.07] bg-transparent",
                    )}
                  >
                    <span className={cn("flex-1 text-[12px]", activePreset === presetName ? "font-medium text-indigo-300" : "text-zinc-300")}>
                      {label}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => applyPreset(presetName)}>
                      Apply
                    </Button>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Custom presets">
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input value={customPresetName} onChange={(event) => setCustomPresetName(event.target.value)} placeholder="Preset name" />
                  <Button variant="secondary" onClick={saveCurrentPreset}>Save</Button>
                </div>
                {customPresets.length ? (
                  <div className="space-y-1.5">
                    {customPresets.map((preset) => (
                      <div key={preset.id} className="flex items-center gap-2 rounded-[9px] border border-white/[0.07] px-3 py-2">
                        <span className="flex-1 text-[12px] text-zinc-300">{preset.name}</span>
                        <Button size="sm" variant="ghost" onClick={() => {
                          setActivePreset(preset.name);
                          setOptions(preset.options);
                        }}>
                          Apply
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => removeCustomPreset(preset.id)}>
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-500">No custom presets saved yet.</p>
                )}
              </div>
            </Section>
          </>
        ) : null}

        {activeTab === "batch" ? (
          <div className="space-y-3 p-3">
            <CollapsibleSection title="Queue behavior" description="How files are managed in the queue" icon={SlidersHorizontal}>
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-[10px] border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                  <div>
                    <p className="text-[12px] font-medium text-[var(--text)]">Skip duplicates</p>
                    <p className="text-[11px] text-[var(--muted)]">Ignore files already in the current queue</p>
                  </div>
                  <Toggle checked={skipDuplicates} onChange={setSkipDuplicates} />
                </div>
              </div>
            </CollapsibleSection>
            <CollapsibleSection title="Performance" description="Parallel workers and memory usage" icon={Cpu}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-zinc-400">Parallel workers</span>
                  <Toggle checked={parallelWorkersEnabled} onChange={setParallelWorkersEnabled} />
                </div>
                <div className="flex items-center gap-2">
                  <Slider value={workerCount} min={1} max={8} onValueChange={setWorkerCount} />
                  <span className="w-7 text-right font-mono text-[10px] text-zinc-500">{workerCount}</span>
                </div>
                {workerCount >= 6 ? <p className="text-[11px] text-zinc-500">Higher values use more memory and can reduce stability on low-memory systems.</p> : null}
              </div>
            </CollapsibleSection>
          </div>
        ) : null}
      </div>
    </div>
  );
}
