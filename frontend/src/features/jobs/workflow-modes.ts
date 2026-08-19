import type { ProcessingOptions } from "@/types";

export type WorkflowMode = ProcessingOptions["workflow_mode"];

/**
 * The three things people actually open this app to do.
 *
 * `workflow_mode` already existed on the schema but nothing read it - the
 * pipeline branches on `remove_background` and `enhance_level`. A mode sets
 * both, so picking one is enough to get a working batch without touching the
 * advanced panel.
 */
export const WORKFLOW_MODES: Array<{
  id: WorkflowMode;
  label: string;
  summary: string;
  /** Applied on top of the current options when the mode is selected. */
  apply: Partial<ProcessingOptions>;
}> = [
  {
    id: "cutout_only",
    label: "Remove background",
    summary: "Cut the subject out and export it with transparency.",
    apply: {
      workflow_mode: "cutout_only",
      remove_background: true,
      enhance_level: "off",
      output_format: "png",
      background_mode: "transparent",
    },
  },
  {
    id: "enhance_only",
    label: "Optimize images",
    summary: "Keep the picture as it is, convert and shrink it for delivery.",
    apply: {
      workflow_mode: "enhance_only",
      remove_background: false,
      enhance_level: "off",
      output_format: "webp",
      background_mode: "transparent",
    },
  },
  {
    id: "cutout_enhance",
    label: "Remove and upscale",
    summary: "Cut the subject out, then enlarge it 2x.",
    apply: {
      workflow_mode: "cutout_enhance",
      remove_background: true,
      enhance_level: "2x",
      output_format: "png",
      background_mode: "transparent",
    },
  },
];

/**
 * Which mode the current options correspond to.
 *
 * Derived rather than trusted: a preset or the advanced panel can leave
 * `workflow_mode` disagreeing with the flags the pipeline actually reads.
 */
export function modeFromOptions(options: ProcessingOptions): WorkflowMode {
  const upscaling = options.enhance_level !== "off";
  if (!options.remove_background) return "enhance_only";
  return upscaling ? "cutout_enhance" : "cutout_only";
}
