"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Brush, Eraser, Eye, EyeOff, WandSparkles, X } from "lucide-react";
import { Button, Slider } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { UploadItem } from "@/types";

type BrushMode = "keep" | "remove" | "magic_remove";
type ReferenceView = "original" | "processed";
type CanvasPoint = { x: number; y: number };
type CursorState = { x: number; y: number; visible: boolean };

type Props = {
  open: boolean;
  item?: UploadItem;
  outputUrl?: string;
  onClose: () => void;
  onSave: (dataUrl?: string) => void;
};

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createImage(src: string, crossOrigin?: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (crossOrigin) image.crossOrigin = crossOrigin;
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

async function loadImageForCanvas(url: string): Promise<{ image: HTMLImageElement; cleanup?: () => void }> {
  if (url.startsWith("blob:") || url.startsWith("data:")) {
    return { image: await createImage(url) };
  }
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Image request failed: ${response.status}`);
    const objectUrl = URL.createObjectURL(await response.blob());
    return { image: await createImage(objectUrl), cleanup: () => URL.revokeObjectURL(objectUrl) };
  } catch {
    return { image: await createImage(url, "anonymous") };
  }
}

function brushColor(mode: BrushMode): string {
  if (mode === "keep") return "rgba(52, 211, 153, 1)";
  if (mode === "remove") return "rgba(248, 113, 113, 1)";
  return "rgba(255, 255, 255, 0.8)";
}

// ─── Tool button ─────────────────────────────────────────────────────────────

function ToolButton({
  active,
  color,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  color: "green" | "red" | "indigo";
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  const activeStyles = {
    green: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
    red: "bg-red-500/15 border-red-500/30 text-red-300",
    indigo: "bg-indigo-500/15 border-indigo-500/30 text-indigo-300",
  };
  const dotStyles = {
    green: "bg-emerald-400",
    red: "bg-red-400",
    indigo: "bg-indigo-400",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[9px] border px-3 py-2 text-left transition-all duration-150",
        active
          ? activeStyles[color]
          : "border-transparent bg-white/[0.04] text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-200",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="text-[12px] font-medium leading-none">{label}</span>
      {active && (
        <span className={cn("ml-auto h-1.5 w-1.5 shrink-0 rounded-full", dotStyles[color])} />
      )}
    </button>
  );
}

function PanelLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600">{children}</p>
      {right}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MaskEditorModal({ open, item, outputUrl, onClose, onSave }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const maskStageRef = useRef<HTMLDivElement>(null);
  const sourcePixelsRef = useRef<{ width: number; height: number; data: Uint8ClampedArray } | null>(null);
  const lastPointRef = useRef<CanvasPoint | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [mode, setMode] = useState<BrushMode>("keep");
  const [brushSize, setBrushSize] = useState(20);
  const [magicTolerance, setMagicTolerance] = useState(32);
  const [imageReady, setImageReady] = useState(false);
  const [referenceView, setReferenceView] = useState<ReferenceView>("original");
  const [referenceCollapsed, setReferenceCollapsed] = useState(false);
  const [cursor, setCursor] = useState<CursorState>({ x: 0, y: 0, visible: false });
  const [loadError, setLoadError] = useState<string>("");
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [open, onClose]);

  useEffect(() => {
    const previewUrl = item?.preview_url;
    if (!open || !previewUrl || !canvasRef.current) return;
    let active = true;
    let cleanupLoadedImage: (() => void) | undefined;
    setImageReady(false);
    setLoadError("");
    setCursor((c) => ({ ...c, visible: false }));
    sourcePixelsRef.current = null;
    lastPointRef.current = null;
    void (async () => {
      try {
        const loaded = await loadImageForCanvas(previewUrl);
        cleanupLoadedImage = loaded.cleanup;
        if (!active) { cleanupLoadedImage?.(); return; }
        const image = loaded.image;
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const sourceCanvas = document.createElement("canvas");
        sourceCanvas.width = image.naturalWidth;
        sourceCanvas.height = image.naturalHeight;
        const sourceCtx = sourceCanvas.getContext("2d");
        if (sourceCtx) {
          sourceCtx.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight);
          try {
            const d = sourceCtx.getImageData(0, 0, image.naturalWidth, image.naturalHeight);
            sourcePixelsRef.current = { width: image.naturalWidth, height: image.naturalHeight, data: d.data };
          } catch (error) {
            setLoadError(`Magic remove unavailable: ${describeError(error)}`);
          }
        }
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (item.mask_hint_data_url) {
          const existingMask = await createImage(item.mask_hint_data_url);
          if (!active) return;
          ctx.drawImage(existingMask, 0, 0, canvas.width, canvas.height);
        }
        setImageReady(true);
      } catch (error) {
        if (!active) return;
        setLoadError(describeError(error));
      }
    })();
    return () => { active = false; cleanupLoadedImage?.(); setIsDrawing(false); };
  }, [open, item?.mask_hint_data_url, item?.preview_url]);

  useEffect(() => {
    if (!open || !imageReady) return;
    const updateDisplaySize = () => {
      const canvas = canvasRef.current;
      const stage = maskStageRef.current;
      if (!canvas || !stage) return;
      const scale = Math.min(stage.clientWidth / canvas.width, stage.clientHeight / canvas.height);
      if (!Number.isFinite(scale) || scale <= 0) return;
      setDisplaySize({ width: Math.max(1, Math.floor(canvas.width * scale)), height: Math.max(1, Math.floor(canvas.height * scale)) });
    };
    updateDisplaySize();
    if (!maskStageRef.current || !("ResizeObserver" in window)) {
      window.addEventListener("resize", updateDisplaySize);
      return () => window.removeEventListener("resize", updateDisplaySize);
    }
    const observer = new ResizeObserver(updateDisplaySize);
    observer.observe(maskStageRef.current);
    return () => observer.disconnect();
  }, [open, imageReady, referenceCollapsed]);

  const getCanvasPoint = (clientX: number, clientY: number): CanvasPoint | null => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return null;
    const rect = overlay.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: (Math.max(0, Math.min(rect.width, clientX - rect.left)) / rect.width) * canvas.width,
      y: (Math.max(0, Math.min(rect.height, clientY - rect.top)) / rect.height) * canvas.height,
    };
  };

  const updateCursor = (clientX: number, clientY: number) => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    setCursor({
      x: Math.max(0, Math.min(rect.width, clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, clientY - rect.top)),
      visible: mode !== "magic_remove" && imageReady,
    });
  };

  const drawStroke = (from: CanvasPoint, to: CanvasPoint) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || mode === "magic_remove") return;
    const color = brushColor(mode);
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = brushSize * 2;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(to.x, to.y, brushSize, 0, Math.PI * 2);
    ctx.fill();
  };

  const fillMagicRemove = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const sourcePixels = sourcePixelsRef.current;
    if (!canvas || !overlay || !sourcePixels) return;
    const rect = overlay.getBoundingClientRect();
    const seedX = Math.max(0, Math.min(sourcePixels.width - 1, Math.floor((clientX - rect.left) * (sourcePixels.width / rect.width))));
    const seedY = Math.max(0, Math.min(sourcePixels.height - 1, Math.floor((clientY - rect.top) * (sourcePixels.height / rect.height))));
    const seedIdx = (seedY * sourcePixels.width + seedX) * 4;
    const seedColor = [sourcePixels.data[seedIdx], sourcePixels.data[seedIdx + 1], sourcePixels.data[seedIdx + 2]];
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const output = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const visited = new Uint8Array(sourcePixels.width * sourcePixels.height);
    const queue: number[] = [seedY * sourcePixels.width + seedX];
    const tSq = magicTolerance * magicTolerance;
    while (queue.length > 0) {
      const idx = queue.pop() as number;
      if (visited[idx]) continue;
      visited[idx] = 1;
      const x = idx % sourcePixels.width;
      const y = Math.floor(idx / sourcePixels.width);
      const di = idx * 4;
      const dr = sourcePixels.data[di] - seedColor[0];
      const dg = sourcePixels.data[di + 1] - seedColor[1];
      const db = sourcePixels.data[di + 2] - seedColor[2];
      if (dr * dr + dg * dg + db * db > tSq) continue;
      output.data[di] = 255; output.data[di + 1] = 0; output.data[di + 2] = 0; output.data[di + 3] = 255;
      if (x > 0) queue.push(idx - 1);
      if (x < sourcePixels.width - 1) queue.push(idx + 1);
      if (y > 0) queue.push(idx - sourcePixels.width);
      if (y < sourcePixels.height - 1) queue.push(idx + sourcePixels.width);
    }
    ctx.putImageData(output, 0, 0);
  };

  const clearMask = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  if (!item) return null;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/78 p-4 backdrop-blur-[3px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className="flex h-[min(92vh,980px)] w-full max-w-[1440px] flex-col overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_30px_120px_rgba(0,0,0,0.45)]"
            initial={{ opacity: 0, y: 20, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.985 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-indigo-500/15 text-indigo-400">
                  <Brush className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--muted)]">Refine mask</p>
                  <p className="truncate text-[13px] font-semibold text-[var(--text)]">{item.filename}</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Body grid */}
            <div
              className={cn(
                "grid min-h-0 flex-1",
                referenceCollapsed
                  ? "grid-cols-[240px_minmax(0,1fr)]"
                  : "grid-cols-[240px_minmax(0,1fr)_minmax(0,1fr)]",
              )}
            >
              {/* ── Left panel ── */}
              <div className="flex flex-col overflow-y-auto border-r border-[var(--border)] bg-[var(--panel)]">

                {/* Tools */}
                <div className="border-b border-[var(--border)] px-3 py-3.5">
                  <PanelLabel>Tool</PanelLabel>
                  <div className="space-y-1">
                    <ToolButton active={mode === "keep"} color="green" icon={Brush} label="Keep brush" onClick={() => setMode("keep")} />
                    <ToolButton active={mode === "remove"} color="red" icon={Eraser} label="Remove brush" onClick={() => setMode("remove")} />
                    <ToolButton active={mode === "magic_remove"} color="indigo" icon={WandSparkles} label="Magic remove" onClick={() => setMode("magic_remove")} />
                  </div>
                </div>

                {/* Brush size */}
                <div className="border-b border-[var(--border)] px-3 py-3.5">
                  <PanelLabel right={<span className="font-mono text-[10px] text-zinc-500">{brushSize}px</span>}>
                    Brush size
                  </PanelLabel>
                  <Slider value={brushSize} min={4} max={80} onValueChange={setBrushSize} />
                </div>

                {/* Magic tolerance */}
                {mode === "magic_remove" && (
                  <div className="border-b border-[var(--border)] px-3 py-3.5">
                    <PanelLabel right={<span className="font-mono text-[10px] text-zinc-500">{magicTolerance}</span>}>
                      Tolerance
                    </PanelLabel>
                    <Slider value={magicTolerance} min={8} max={100} onValueChange={setMagicTolerance} />
                  </div>
                )}

                {/* Reference toggle */}
                <div className="border-b border-[var(--border)] px-3 py-3.5">
                  <PanelLabel>Reference</PanelLabel>
                  <div className="flex overflow-hidden rounded-[8px] border border-[var(--border)]">
                    {(["original", "processed"] as const).map((view) => (
                      <button
                        key={view}
                        type="button"
                        disabled={view === "processed" && !outputUrl}
                        onClick={() => setReferenceView(view)}
                        className={cn(
                          "flex-1 py-1.5 text-[11px] font-medium capitalize transition-all duration-150",
                          referenceView === view
                            ? "bg-white/[0.09] text-zinc-100"
                            : "text-zinc-500 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-35",
                        )}
                      >
                        {view}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="px-3 py-3.5">
                  <PanelLabel>Actions</PanelLabel>
                  <div className="space-y-1.5">
                    <Button variant="secondary" size="sm" className="w-full justify-start" onClick={clearMask}>
                      Clear mask
                    </Button>
                    <Button variant="secondary" size="sm" className="w-full justify-start" onClick={() => onSave(undefined)}>
                      Disable mask
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => { const canvas = canvasRef.current; onSave(canvas?.toDataURL("image/png")); }}
                    >
                      Save mask
                    </Button>
                  </div>
                </div>

                {/* Hint footer */}
                <div className="mt-auto border-t border-[var(--border)] px-3 py-3">
                  <p className="text-[11px] leading-5 text-zinc-500">
                    {mode === "magic_remove"
                      ? "Click to flood-fill a similar colour region."
                      : "Paint \u2014 green keeps · red removes."}
                  </p>
                </div>

                {loadError && (
                  <div className="mx-3 mb-3 rounded-[8px] border border-red-500/20 bg-red-500/[0.06] px-2.5 py-2 text-[10px] text-red-300">
                    {loadError}
                  </div>
                )}
              </div>

              {/* ── Reference panel ── */}
              {!referenceCollapsed && (
                <div className="flex min-h-0 flex-col border-r border-[var(--border)] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-zinc-300">Reference</p>
                    <button
                      type="button"
                      onClick={() => setReferenceCollapsed(true)}
                      className="flex items-center gap-1 rounded-[6px] px-2 py-1 text-[10px] text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-300"
                    >
                      <EyeOff className="h-3 w-3" />
                      Hide
                    </button>
                  </div>
                  <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[10px] border border-[var(--border)] bg-black/60">
                    {referenceView === "processed" && outputUrl ? (
                      <img src={outputUrl} alt={`${item.filename} processed`} className="max-h-full w-full object-contain" />
                    ) : item.preview_url ? (
                      <img src={item.preview_url} alt={item.filename} className="max-h-full w-full object-contain" />
                    ) : null}
                  </div>
                </div>
              )}

              {/* ── Canvas panel ── */}
              <div className="flex min-h-0 flex-col p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] font-semibold text-zinc-300">Mask hint</p>
                    {referenceCollapsed && (
                      <button
                        type="button"
                        onClick={() => setReferenceCollapsed(false)}
                        className="flex items-center gap-1 rounded-[6px] px-2 py-1 text-[10px] text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-300"
                      >
                        <Eye className="h-3 w-3" />
                        Reference
                      </button>
                    )}
                  </div>
                  <span className="font-mono text-[10px] text-zinc-600">
                    {mode === "magic_remove" ? "click to fill" : `${brushSize}px`}
                  </span>
                </div>

                <div
                  ref={maskStageRef}
                  className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[10px] border border-[var(--border)] bg-black/60"
                >
                  <div
                    ref={overlayRef}
                    className={cn(
                      "relative inline-flex select-none touch-none items-center justify-center",
                      mode !== "magic_remove" && imageReady ? "cursor-none" : "cursor-crosshair",
                    )}
                    style={displaySize ? { width: displaySize.width, height: displaySize.height, maxWidth: "100%", maxHeight: "100%" } : undefined}
                    onPointerDown={(event) => {
                      if (!imageReady) return;
                      event.preventDefault();
                      event.stopPropagation();
                      updateCursor(event.clientX, event.clientY);
                      if (mode === "magic_remove") { fillMagicRemove(event.clientX, event.clientY); return; }
                      const point = getCanvasPoint(event.clientX, event.clientY);
                      if (!point) return;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setIsDrawing(true);
                      lastPointRef.current = point;
                      drawStroke(point, point);
                    }}
                    onPointerMove={(event) => {
                      updateCursor(event.clientX, event.clientY);
                      if (!isDrawing || mode === "magic_remove") return;
                      const point = getCanvasPoint(event.clientX, event.clientY);
                      const prev = lastPointRef.current;
                      if (!point || !prev) return;
                      drawStroke(prev, point);
                      lastPointRef.current = point;
                    }}
                    onPointerUp={(event) => {
                      event.stopPropagation();
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                      setIsDrawing(false);
                      lastPointRef.current = null;
                    }}
                    onPointerCancel={(event) => {
                      event.stopPropagation();
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                      setIsDrawing(false);
                      lastPointRef.current = null;
                      setCursor((c) => ({ ...c, visible: false }));
                    }}
                    onPointerLeave={() => setCursor((c) => ({ ...c, visible: false }))}
                  >
                    {item.preview_url && (
                      <img src={item.preview_url} alt={item.filename} className="pointer-events-none h-full w-full object-contain opacity-40" />
                    )}
                    <canvas
                      ref={canvasRef}
                      className={cn("pointer-events-none absolute inset-0 h-full w-full", imageReady ? "" : "hidden")}
                    />
                    {cursor.visible && (
                      <span
                        className="pointer-events-none absolute box-border rounded-full border border-white/80"
                        style={{
                          width: brushSize * 2,
                          height: brushSize * 2,
                          left: cursor.x,
                          top: cursor.y,
                          transform: "translate(-50%, -50%)",
                        }}
                      />
                    )}
                  </div>
                </div>

                <p className="mt-2 text-[10px] text-zinc-600">
                  Save the hint then re-run the item from the queue to apply it.
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}