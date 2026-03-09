"use client";

import { useEffect, useId, useMemo, useState, type ComponentType, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ChevronDown, Cpu, Image, Palette, SlidersHorizontal } from "lucide-react";
import { Button, Checkbox, Collapsible, CollapsibleContent, CollapsibleTrigger, Input, Select, Slider, Switch } from "@/components/ui";
import { presets, useAppStore } from "@/stores/use-app-store";
import { cn } from "@/lib/utils";
import type { ProcessingOptions } from "@/types";

type SettingsTab = "general" | "naming" | "templates";
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
const workspaceTabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "general", label: "General" },
  { id: "naming", label: "Naming" },
  { id: "templates", label: "Templates" },
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

const modelOptions = [
  { value: "u2net", label: "rembg · u2net (local)", dotColor: "#a5b4fc", hint: "general", group: "Local" },
  { value: "isnet-general-use", label: "rembg · isnet-general", dotColor: "#a5b4fc", hint: "precise", group: "Local" },
  { value: "birefnet-portrait", label: "rembg · portrait", dotColor: "#a5b4fc", hint: "portrait", group: "Local" },
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-medium text-zinc-400">{label}</label>
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
      <section className="overflow-hidden rounded-[14px] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
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
        <CollapsibleContent className="border-t border-white/[0.07] px-4 pb-4 pt-3">
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
  const { options, setOptions, activePreset, setActivePreset } = useAppStore();
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === "general" ? (
          <div className="space-y-3 p-3">
            <CollapsibleSection title="Output" description="Format, quality and resize behavior" icon={Image}>
              <div className="space-y-3">
                <Field label="Format">
                  <Select
                    value={options.output_format}
                    options={formatOptions}
                    onChange={(value) => setOptions({ output_format: value as ProcessingOptions["output_format"] })}
                  />
                </Field>
                <Field label="Quality">
                  <div className="flex items-center gap-2">
                    <Slider value={options.quality} min={1} max={100} onValueChange={(value) => setOptions({ quality: value })} />
                    <span className="w-7 text-right font-mono text-[10px] text-zinc-500">{options.quality}</span>
                  </div>
                </Field>
                <Field label="Size">
                  <Select
                    value={options.resize_mode}
                    options={resizeModeOptions}
                    onChange={(value) => setOptions({ resize_mode: value as ProcessingOptions["resize_mode"] })}
                  />
                </Field>
                {options.resize_mode === "custom" ? (
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
                ) : null}
                <Field label="Aspect ratio">
                  <Select
                    value={options.aspect_ratio}
                    options={aspectRatioOptions}
                    onChange={(value) => setOptions({ aspect_ratio: value })}
                  />
                </Field>
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Background" description="Transparent or solid fills for export" icon={Palette}>
              <div className="space-y-3">
                <Field label="Mode">
                  <Select
                    value={options.background_mode}
                    options={backgroundOptions}
                    onChange={(value) => setOptions({ background_mode: value as ProcessingOptions["background_mode"] })}
                  />
                </Field>
                <Field label="Quick colors">
                  <div className="flex flex-wrap gap-1.5">
                    {quickSwatches.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setOptions({ background_color: color, background_mode: "solid" })}
                        className={cn(
                          "h-[22px] w-[22px] rounded-[5px] border-2 border-transparent transition-transform hover:scale-105",
                          options.background_color.toLowerCase() === color.toLowerCase() && options.background_mode === "solid" && "border-white/60",
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => setOptions({ background_mode: "transparent" })}
                      className={cn(
                        "h-[22px] w-[22px] rounded-[5px] border-2 border-transparent bg-[conic-gradient(#333_0%_25%,#1a1a1a_0%_50%)] bg-[length:8px_8px] transition-transform hover:scale-105",
                        options.background_mode === "transparent" && "border-white/60",
                      )}
                    />
                  </div>
                </Field>
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Model" description="Choose the local backend and cleanup passes" icon={Cpu}>
              <div className="space-y-3">
                <Field label="Backend">
                  <Select
                    value={options.local_model}
                    options={modelOptions}
                    onChange={(value) => {
                      setOptions({
                        local_model: value,
                        provider_priority: ["rembg_local", "simple_cv_local", "remove_bg_api"],
                      });
                    }}
                  />
                </Field>
                <div className="space-y-2">
                  <CheckRow checked={options.edge_feather_radius > 0} onChange={(checked) => setOptions({ edge_feather_radius: checked ? 1 : 0 })} label="Alpha matting" />
                  <CheckRow checked={options.white_halo_cleanup > 0} onChange={(checked) => setOptions({ white_halo_cleanup: checked ? 35 : 0 })} label="Post-process mask" />
                  <CheckRow checked={options.trim_transparent_bounds} onChange={(checked) => setOptions({ trim_transparent_bounds: checked })} label="Auto-crop output" />
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Concurrency" description="Control parallel workers for batch runs" icon={SlidersHorizontal} defaultOpen={false}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-zinc-400">Parallel workers</span>
                  <Toggle checked={parallelWorkersEnabled} onChange={setParallelWorkersEnabled} />
                </div>
                <div className="flex items-center gap-2">
                  <Slider value={workerCount} min={1} max={8} onValueChange={setWorkerCount} />
                  <span className="w-7 text-right font-mono text-[10px] text-zinc-500">{workerCount}</span>
                </div>
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

        {activeTab === "templates" ? (
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
      </div>
    </div>
  );
}
