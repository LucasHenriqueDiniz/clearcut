"use client";

export type DevLogLevel = "info" | "warn" | "error";

export type DevLogEntry = {
  id: string;
  ts: number;
  level: DevLogLevel;
  message: string;
  data?: string;
};

const listeners = new Set<() => void>();
const entries: DevLogEntry[] = [];
const MAX_ENTRIES = 500;

function notify() {
  listeners.forEach((listener) => listener());
}

export function logEvent(level: DevLogLevel, message: string, data?: unknown) {
  entries.push({
    id: crypto.randomUUID(),
    ts: Date.now(),
    level,
    message,
    data: data ? String(data) : undefined,
  });
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
  notify();
}

export function getLogEntries(): DevLogEntry[] {
  return [...entries];
}

export function clearLogEntries() {
  entries.length = 0;
  notify();
}

export function subscribeLogs(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
