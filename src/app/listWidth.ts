// The setup list's width: the user drags a handle (or uses the keys on it) so long setup names show in full.
// Remembered in localStorage like the other settings: it can be blocked, full or empty, so every access is guarded.
export const LIST_WIDTH = { min: 160, max: 420, default: 192, step: 16, bigStep: 48 } as const;
export const LIST_WIDTH_KEY = 'uc4-editor-list-width';

export const clampWidth = (n: number): number =>
  Number.isFinite(n) ? Math.min(LIST_WIDTH.max, Math.max(LIST_WIDTH.min, Math.round(n))) : LIST_WIDTH.default;

/** Stored text to a width; anything unexpected is the default. */
export function parseWidth(text: string | null): number {
  if (text === null || text.trim() === '') return LIST_WIDTH.default;
  return clampWidth(Number(text));
}

/** The width a key on the handle gives (the list is on the right: ← moves the handle left, so widens), or null when the key is not for the handle. */
export function widthForKey(width: number, key: string, shift: boolean): number | null {
  const step = shift ? LIST_WIDTH.bigStep : LIST_WIDTH.step;
  switch (key) {
    case 'ArrowLeft': case 'ArrowUp': return clampWidth(width + step);
    case 'ArrowRight': case 'ArrowDown': return clampWidth(width - step);
    case 'Home': return LIST_WIDTH.min;
    case 'End': return LIST_WIDTH.max;
    default: return null;
  }
}

export interface WidthStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const browserStorage = (): WidthStorage | null => { try { return localStorage; } catch { return null; } };

export function loadWidth(storage: WidthStorage | null = browserStorage()): number {
  try { return parseWidth(storage?.getItem(LIST_WIDTH_KEY) ?? null); } catch { return LIST_WIDTH.default; }
}
export function saveWidth(width: number, storage: WidthStorage | null = browserStorage()): void {
  try { storage?.setItem(LIST_WIDTH_KEY, String(clampWidth(width))); } catch { /* the width lasts until the tab closes */ }
}
