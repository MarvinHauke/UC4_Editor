// Whether the monitor is shrunk to one line (plan 0008 decisions 11, 18 and 24: the drag handle and the stored height are gone,
// the list fills the rest of the column). Kept in localStorage like the other per-viewer conveniences; every access is guarded.
export const MONITOR_SIZE_KEY = 'uc4-editor-monitor-size';

export interface MonitorSize { oneLine: boolean }
export const DEFAULT_SIZE: MonitorSize = { oneLine: false };

/** Stored text to a size; anything unexpected (an old stored height included) is the default for that field. */
export function parseSize(text: string | null): MonitorSize {
  if (!text) return { ...DEFAULT_SIZE };
  try {
    const o = JSON.parse(text) as { oneLine?: unknown } | null;
    return typeof o === 'object' && o !== null ? { oneLine: o.oneLine === true } : { ...DEFAULT_SIZE };
  } catch { return { ...DEFAULT_SIZE }; }
}

export interface SizeStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const browserStorage = (): SizeStorage | null => { try { return localStorage; } catch { return null; } };

export function loadSize(storage: SizeStorage | null = browserStorage()): MonitorSize {
  try { return parseSize(storage?.getItem(MONITOR_SIZE_KEY) ?? null); } catch { return { ...DEFAULT_SIZE }; }
}
export function saveSize(size: MonitorSize, storage: SizeStorage | null = browserStorage()): void {
  try { storage?.setItem(MONITOR_SIZE_KEY, JSON.stringify({ oneLine: size.oneLine })); } catch { /* it lasts until the tab closes */ }
}
