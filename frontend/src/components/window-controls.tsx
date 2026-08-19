import { useEffect, useState } from "react";
import { Minus, Square, X } from "lucide-react";
import { isTauriEnvironment } from "@/lib/platform";

/**
 * Minimize / maximize / close for the custom title bar.
 *
 * Deliberately separate from the app header: the header carries navigation and
 * has to render in both runtimes, while these controls only exist when a Tauri
 * window is actually there to control.
 */
export function WindowControls() {
  const [enabled, setEnabled] = useState(false);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauriEnvironment()) return;
    setEnabled(true);

    let removeResizeListener: (() => void) | undefined;
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      setMaximized(await win.isMaximized());
      removeResizeListener = await win.onResized(async () => {
        setMaximized(await win.isMaximized());
      });
    });

    return () => removeResizeListener?.();
  }, []);

  if (!enabled) return null;

  const run = async (action: "minimize" | "maximize" | "close") => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    if (action === "minimize") return void win.minimize();
    if (action === "close") return void win.close();
    const isMax = await win.isMaximized();
    await (isMax ? win.unmaximize() : win.maximize());
    setMaximized(!isMax);
  };

  return (
    <div className="flex h-full items-center" data-titlebar-ignore-drag>
      <button
        type="button"
        data-titlebar-ignore-drag
        className="flex h-full w-11 items-center justify-center text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-indigo-400/70"
        onClick={() => void run("minimize")}
        aria-label="Minimize window"
      >
        <Minus className="h-3 w-3" />
      </button>
      <button
        type="button"
        data-titlebar-ignore-drag
        className="flex h-full w-11 items-center justify-center text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-indigo-400/70"
        onClick={() => void run("maximize")}
        aria-label={maximized ? "Restore window" : "Maximize window"}
      >
        <Square className="h-3 w-3" />
      </button>
      <button
        type="button"
        data-titlebar-ignore-drag
        className="flex h-full w-11 items-center justify-center text-zinc-500 transition-colors hover:bg-[#e81123] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-indigo-400/70"
        onClick={() => void run("close")}
        aria-label="Close window"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
