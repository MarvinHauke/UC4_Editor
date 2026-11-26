// The monitor's size (plan 0008 decisions 11 and 18): the list's height, dragged or set with the keys on its handle, and
// whether it is shrunk to one line. Kept in localStorage like the other per-viewer conveniences; every access is guarded.
export const MONITOR_HEIGHT = { min: 84, max: 640, default: 224, step: 28, bigStep: 112 } as const;
export const MONITOR_SIZE_KEY = 'uc4-editor-monitor-size';

export interface MonitorSize { height: number; oneLine: boolean }
export const DEFAULT_SIZE: MonitorSize = { height: MONITOR_HEIGHT.default, oneLine: false };

export const clampHeight = (n: number): number =>
  Number.isFinite(n) ? Math.min(MONITOR_HEIGHT.max, Math.max(MONITOR_HEIGHT.min, Math.round(n))) : MONITOR_HEIGHT.default;

/** Stored text to a size; anything unexpected is the default for that field. */
export function parseSize(text: string | null): MonitorSize {
  if (!text) return { ...DEFAULT_SIZE };
  try {
    const o = JSON.parse(text) as { height?: unknown; oneLine?: unknown } | null;
    if (typeof o !== 'object' || o === null) return { ...DEFAULT_SIZE };
    return { height: typeof o.height === 'number' ? clampHeight(o.height) : DEFAULT_SIZE.height, oneLine: o.oneLine === true };
  } catch { return { ...DEFAULT_SIZE }; }
}

/** The height a key on the handle gives (the monitor sits at the bottom: ↑ moves the handle up, so grows), or null for other keys. */
export function heightForKey(height: number, key: string, shift: boolean): number | null {
  const step = shift ? MONITOR_HEIGHT.bigStep : MONITOR_HEIGHT.step;
  switch (key) {
    case 'ArrowUp': return clampHeight(height + step);
    case 'ArrowDown': return clampHeight(height - step);
    case 'Home': return MONITOR_HEIGHT.max;
    case 'End': return MONITOR_HEIGHT.min;
    default: return null;
  }
}

export interface SizeStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const browserStorage = (): SizeStorage | null => { try { return localStorage; } catch { return null; } };

export function loadSize(storage: SizeStorage | null = browserStorage()): MonitorSize {
  try { return parseSize(storage?.getItem(MONITOR_SIZE_KEY) ?? null); } catch { return { ...DEFAULT_SIZE }; }
}
export function saveSize(size: MonitorSize, storage: SizeStorage | null = browserStorage()): void {
  try { storage?.setItem(MONITOR_SIZE_KEY, JSON.stringify({ height: clampHeight(size.height), oneLine: size.oneLine })); } catch { /* the size lasts until the tab closes */ }
}
