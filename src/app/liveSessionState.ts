// The live session's saved state (plan 0008 decision 15): "don't ask again" survives a reload and end with
// the tab, so they live in sessionStorage. Every access is guarded: the storage can be blocked or empty.
import { SESSION_STATE_KEY } from './storageKeys.ts';
export { SESSION_STATE_KEY };

export interface SessionStorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
const browserStorage = (): SessionStorageLike | null => { try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; } };

/** What was saved, parsed (the session checks its shape); null when there is none. Never throws. */
export function loadSessionState(storage: SessionStorageLike | null = browserStorage()): unknown {
  try {
    const text = storage?.getItem(SESSION_STATE_KEY);
    return text ? JSON.parse(text) : null;
  } catch { return null; }
}

/** Saves the state; returns the text saved so a caller can skip saving the same state again. */
export function saveSessionState(state: unknown, storage: SessionStorageLike | null = browserStorage()): string {
  const text = JSON.stringify(state);
  try { storage?.setItem(SESSION_STATE_KEY, text); } catch { /* the state lasts until reload */ }
  return text;
}
