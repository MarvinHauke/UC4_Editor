// Which Connections sections are folded to their heading line (plan 0008 decision 24). Remembered per viewer in localStorage;
// every access is guarded. A section never stored is folded.
export const FOLD_KEY = 'uc4-editor-connections-open';

export interface FoldStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const browserStorage = (): FoldStorage | null => { try { return localStorage; } catch { return null; } };

/** The ids of the sections the user left open. */
export function parseOpen(text: string | null): string[] {
  if (!text) return [];
  try {
    const v = JSON.parse(text) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

export function loadOpen(id: string, storage: FoldStorage | null = browserStorage()): boolean {
  try { return parseOpen(storage?.getItem(FOLD_KEY) ?? null).includes(id); } catch { return false; }
}

export function saveOpen(id: string, open: boolean, storage: FoldStorage | null = browserStorage()): void {
  try {
    const ids = new Set(parseOpen(storage?.getItem(FOLD_KEY) ?? null));
    if (open) ids.add(id); else ids.delete(id);
    storage?.setItem(FOLD_KEY, JSON.stringify([...ids]));
  } catch { /* it lasts until the tab closes */ }
}
