"use client";

import { useEffect, useState } from "react";
import { FolderOpen, ShieldAlert } from "lucide-react";

import { Button, Input, Select, Switch } from "@/components/ui";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { pickDirectoryPath, useIsTauri } from "@/lib/platform";
import { cn } from "@/lib/utils";
import type { PresetItem, WatchFolderItem, WatchFolderPayload } from "@/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presets: PresetItem[];
  initialValue?: WatchFolderItem | null;
  onSubmit: (payload: WatchFolderPayload) => Promise<void> | void;
};

const defaultValue: WatchFolderPayload = {
  name: "",
  input_folder: "",
  output_folder: "",
  preset_id: "quick_cutout",
  is_enabled: true,
  auto_run: true,
  skip_duplicates: true,
  move_processed_files: false,
  processed_folder: "",
  move_failed_files: false,
  failed_folder: "",
  cooldown_ms: 2000,
};

function normalizePath(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function overlaps(left: string, right: string): boolean {
  const a = normalizePath(left);
  const b = normalizePath(right);
  if (!a || !b) return false;
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

// ─── ToggleRow ────────────────────────────────────────────────────────────────
function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start justify-between gap-4 rounded-[10px] border px-3 py-3 transition-colors",
        checked ? "border-white/[0.08] bg-white/[0.025]" : "border-white/[0.05] bg-transparent",
      )}
    >
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-zinc-200">{label}</p>
        <p className="mt-0.5 text-[10px] leading-[1.5] text-zinc-500">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="shrink-0 mt-0.5" />
    </label>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────
function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600">{title}</p>
        {hint ? <p className="mt-0.5 text-[10px] leading-[1.5] text-zinc-600">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

// ─── PathField ────────────────────────────────────────────────────────────────
function PathField({
  label,
  hint,
  value,
  placeholder,
  disabled,
  onChange,
  onBrowse,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onBrowse: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <div>
        <p className="text-[11px] font-medium text-zinc-300">{label}</p>
        {hint ? <p className="mt-0.5 text-[10px] leading-[1.5] text-zinc-500">{hint}</p> : null}
      </div>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button variant="secondary" onClick={onBrowse} disabled={disabled} className="h-8 shrink-0">
          <FolderOpen className="h-3.5 w-3.5" />
          Browse
        </Button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function WatchFolderForm({ open, onOpenChange, presets, initialValue, onSubmit }: Props) {
  const isTauri = useIsTauri();
  const [value, setValue] = useState<WatchFolderPayload>(defaultValue);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSubmitError(null);
    if (initialValue) {
      setValue({
        name: initialValue.name,
        input_folder: initialValue.input_folder,
        output_folder: initialValue.output_folder,
        preset_id: initialValue.preset_id,
        is_enabled: initialValue.is_enabled,
        auto_run: initialValue.auto_run,
        skip_duplicates: initialValue.skip_duplicates,
        move_processed_files: initialValue.move_processed_files,
        processed_folder: initialValue.processed_folder ?? "",
        move_failed_files: initialValue.move_failed_files,
        failed_folder: initialValue.failed_folder ?? "",
        cooldown_ms: initialValue.cooldown_ms,
      });
      return;
    }
    setValue({
      ...defaultValue,
      preset_id:
        presets.find((item) => item.id === "quick_cutout")?.id ??
        presets[0]?.id ??
        "quick_cutout",
    });
  }, [initialValue, open, presets]);

  const browseInto = async (field: "input_folder" | "output_folder" | "processed_folder" | "failed_folder") => {
    const path = await pickDirectoryPath();
    if (!path) return;
    setValue((current) => ({ ...current, [field]: path }));
  };

  const validationError = !value.name.trim()
    ? "Name is required."
    : !value.input_folder.trim() || !value.output_folder.trim()
      ? "Input and output folders are required."
      : overlaps(value.input_folder, value.output_folder)
        ? "Input and output folders cannot overlap — this prevents recursive loops."
        : value.move_processed_files && value.processed_folder && overlaps(value.input_folder, value.processed_folder)
          ? "Processed files folder cannot overlap the input folder."
          : value.move_failed_files && value.failed_folder && overlaps(value.input_folder, value.failed_folder)
            ? "Failed files folder cannot overlap the input folder."
            : null;

  const error = validationError ?? submitError;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[520px] max-w-[100vw] flex-col border-white/[0.07] bg-[#0f0f12] p-0 text-zinc-100"
      >
        <SheetHeader className="border-b border-white/[0.07] px-5 py-4">
          <SheetTitle className="text-[14px]">
            {initialValue ? "Edit watch folder" : "New watch folder"}
          </SheetTitle>
          <SheetDescription className="text-[11px] text-zinc-500">
            Watch folders automate file ingestion into the same batch pipeline used by the manual workspace.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">

          {/* Identity */}
          <FormSection title="Identity">
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-zinc-300">Name</p>
              <Input
                value={value.name}
                onChange={(event) => setValue((current) => ({ ...current, name: event.target.value }))}
                placeholder="e.g. Products Main"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-zinc-300">Preset</p>
              <p className="text-[10px] leading-[1.5] text-zinc-600">
                The watch folder resolves the full pipeline config through this preset.
              </p>
              <Select
                value={value.preset_id}
                options={presets.map((preset) => ({ value: preset.id, label: preset.name }))}
                onChange={(next) => setValue((current) => ({ ...current, preset_id: next }))}
              />
            </div>
          </FormSection>

          {/* Paths */}
          <FormSection
            title="Paths"
            hint="Input and output must stay separate to prevent recursive processing."
          >
            <PathField
              label="Input folder"
              hint="Files dropped here are auto-enqueued."
              value={value.input_folder}
              placeholder="Select source folder"
              disabled={!isTauri}
              onChange={(next) => setValue((current) => ({ ...current, input_folder: next }))}
              onBrowse={() => void browseInto("input_folder")}
            />
            <PathField
              label="Output folder"
              hint="Processed results are written here."
              value={value.output_folder}
              placeholder="Select output folder"
              disabled={!isTauri}
              onChange={(next) => setValue((current) => ({ ...current, output_folder: next }))}
              onBrowse={() => void browseInto("output_folder")}
            />
          </FormSection>

          {/* Behavior */}
          <FormSection title="Behavior">
            <div className="space-y-2">
              <ToggleRow
                label="Enabled"
                hint="Keep the watcher active after saving."
                checked={value.is_enabled}
                onChange={(checked) => setValue((current) => ({ ...current, is_enabled: checked }))}
              />
              <ToggleRow
                label="Auto run"
                hint="Queue a job automatically when a stable file is detected."
                checked={value.auto_run}
                onChange={(checked) => setValue((current) => ({ ...current, auto_run: checked }))}
              />
              <ToggleRow
                label="Skip duplicates"
                hint="Avoid re-enqueueing files already known to the watcher."
                checked={value.skip_duplicates}
                onChange={(checked) => setValue((current) => ({ ...current, skip_duplicates: checked }))}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-zinc-300">Cooldown (ms)</p>
              <p className="text-[10px] leading-[1.5] text-zinc-600">
                Wait for the file to be stable before enqueueing. Default: 2000 ms.
              </p>
              <Input
                type="number"
                value={value.cooldown_ms}
                onChange={(event) =>
                  setValue((current) => ({ ...current, cooldown_ms: Number(event.target.value) || 2000 }))
                }
              />
            </div>
          </FormSection>

          {/* File handling */}
          <FormSection
            title="File handling"
            hint="Optional: move original files after processing completes."
          >
            <div className="space-y-2">
              <ToggleRow
                label="Move processed files"
                hint="After success, move the source file to a separate folder."
                checked={value.move_processed_files}
                onChange={(checked) => setValue((current) => ({ ...current, move_processed_files: checked }))}
              />
              {value.move_processed_files ? (
                <PathField
                  label="Processed files folder"
                  hint="Must stay outside the input folder."
                  value={value.processed_folder ?? ""}
                  placeholder="Select processed folder"
                  disabled={!isTauri}
                  onChange={(next) => setValue((current) => ({ ...current, processed_folder: next }))}
                  onBrowse={() => void browseInto("processed_folder")}
                />
              ) : null}
              <ToggleRow
                label="Move failed files"
                hint="After failure, move the source file to an error folder."
                checked={value.move_failed_files}
                onChange={(checked) => setValue((current) => ({ ...current, move_failed_files: checked }))}
              />
              {value.move_failed_files ? (
                <PathField
                  label="Failed files folder"
                  hint="Must stay outside the input folder."
                  value={value.failed_folder ?? ""}
                  placeholder="Select failed folder"
                  disabled={!isTauri}
                  onChange={(next) => setValue((current) => ({ ...current, failed_folder: next }))}
                  onBrowse={() => void browseInto("failed_folder")}
                />
              ) : null}
            </div>
          </FormSection>

          {/* Validation / submit error */}
          {error ? (
            <div className="flex items-start gap-2 rounded-[10px] border border-amber-500/20 bg-amber-500/[0.07] px-3 py-3">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
              <p className="text-[11px] leading-[1.5] text-amber-300">{error}</p>
            </div>
          ) : null}
        </div>

        <SheetFooter className="border-t border-white/[0.07] px-5 py-4">
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              disabled={Boolean(validationError) || saving}
              onClick={async () => {
                try {
                  setSaving(true);
                  setSubmitError(null);
                  await onSubmit({
                    ...value,
                    processed_folder: value.move_processed_files ? value.processed_folder : null,
                    failed_folder: value.move_failed_files ? value.failed_folder : null,
                  });
                  onOpenChange(false);
                } catch (error) {
                  setSubmitError(error instanceof Error ? error.message : String(error));
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Saving…" : initialValue ? "Update" : "Create"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}