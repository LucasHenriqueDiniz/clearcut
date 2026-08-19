import { useEffect, useState } from "react";

const STORAGE_KEY = "clearcut.default_export_directory";
const CHANGE_EVENT = "clearcut:default-export-directory";

function emitChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function getDefaultExportDirectory(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STORAGE_KEY) ?? "";
}

export function setDefaultExportDirectory(path: string) {
  if (typeof window === "undefined") return;
  const next = path.trim();
  if (!next) {
    window.localStorage.removeItem(STORAGE_KEY);
  } else {
    window.localStorage.setItem(STORAGE_KEY, next);
  }
  emitChange();
}

export function clearDefaultExportDirectory() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  emitChange();
}

export function useDefaultExportDirectory(): [string, (path: string) => void, () => void] {
  const [value, setValue] = useState("");

  useEffect(() => {
    const sync = () => setValue(getDefaultExportDirectory());
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return [value, setDefaultExportDirectory, clearDefaultExportDirectory];
}
