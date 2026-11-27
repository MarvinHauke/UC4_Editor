// Which Connections sections are folded to their heading line (plan 0008 decision 24). Remembered per viewer in localStorage
// (the warnings dialog's Factory layout fold is the exception: sessionStorage, below);
// every access is guarded. A section never touched is folded, unless it says otherwise (the monitor starts open).
import { FACTORY_FOLD_KEY, FOLD_KEY } from './storageKeys.ts';
export { FOLD_KEY };

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

const sessionStore = (): FoldStorage | null => { try { return sessionStorage; } catch { return null; } };

/** The warnings dialog's Factory layout block: folded unless opened earlier in this tab (decision 36: kept for the session). */
export function loadFactoryOpen(storage: FoldStorage | null = sessionStore()): boolean {
  try { return storage?.getItem(FACTORY_FOLD_KEY) === 'open'; } catch { return false; }
}

export function saveFactoryOpen(open: boolean, storage: FoldStorage | null = sessionStore()): void {
  try { storage?.setItem(FACTORY_FOLD_KEY, open ? 'open' : 'folded'); } catch { /* it lasts until the page reloads */ }
}
