"use client";

import { useEffect, useState } from "react";
import { Minus, Square, X } from "lucide-react";
import { isTauriEnvironment } from "@/lib/platform";

export function WindowTitlebar() {
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

    return () => {
      if (removeResizeListener) removeResizeListener();
    };
  }, []);

  if (!enabled) return null;

  const runWindowAction = async (action: "minimize" | "maximize" | "close") => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();

    if (action === "minimize") {
      await win.minimize();
      return;
    }
    if (action === "close") {
      await win.close();
      return;
    }

    if (await win.isMaximized()) {
      await win.unmaximize();
      setMaximized(false);
      return;
    }
    await win.maximize();
    setMaximized(true);
  };

  return (
    <header
      data-tauri-drag-region
      className="flex h-[38px] items-center justify-between border-b border-white/[0.07] bg-[#0a0a0c]"
    >
      <div data-tauri-drag-region className="h-full flex-1" />

      <div className="flex items-center">
        <button
          type="button"
          className="flex h-[38px] w-11 items-center justify-center text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-100"
          onClick={() => void runWindowAction("minimize")}
          aria-label="Minimize window"
        >
          <Minus className="h-3 w-3" />
        </button>
        <button
          type="button"
          className="flex h-[38px] w-11 items-center justify-center text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-100"
          onClick={() => void runWindowAction("maximize")}
          aria-label={maximized ? "Restore window" : "Maximize window"}
        >
          <Square className="h-3 w-3" />
        </button>
        <button
          type="button"
          className="flex h-[38px] w-11 items-center justify-center text-zinc-500 transition hover:bg-red-500/20 hover:text-red-400"
          onClick={() => void runWindowAction("close")}
          aria-label="Close window"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </header>
  );
}
