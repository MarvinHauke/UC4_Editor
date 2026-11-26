// Which Connections sections are folded to their heading line (plan 0008 decision 24). Remembered per viewer in localStorage;
// every access is guarded. A section never touched is folded, unless it says otherwise (the monitor starts open).
export const FOLD_KEY = 'uc4-editor-connections-folds';

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

/** Open or folded as the user left it; `fallback` is the state of a section never touched (an explicit fold is stored as `!id`). */
export function loadOpen(id: string, storage: FoldStorage | null = browserStorage(), fallback = false): boolean {
  try {
    const ids = parseOpen(storage?.getItem(FOLD_KEY) ?? null);
    return ids.includes(id) ? true : ids.includes(`!${id}`) ? false : fallback;
  } catch { return fallback; }
}

export function saveOpen(id: string, open: boolean, storage: FoldStorage | null = browserStorage()): void {
  try {
    const ids = new Set(parseOpen(storage?.getItem(FOLD_KEY) ?? null));
    ids.delete(open ? `!${id}` : id);
    ids.add(open ? id : `!${id}`);
    storage?.setItem(FOLD_KEY, JSON.stringify([...ids]));
  } catch { /* it lasts until the tab closes */ }
}
