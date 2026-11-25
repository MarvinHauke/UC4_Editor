// Per-viewer conveniences (plan 0006 decision 14): theme, slide speed, whether the panel is open.
// Kept in localStorage, wrapped in try/catch: it can be blocked, full or empty, and nothing here is library data.
import { getContext } from 'svelte';

export type Theme = 'system' | 'light' | 'dark';
/** `slideMs` is null until the user sets a speed: then the default applies, and `prefers-reduced-motion` turns the slide off. */
export type Keys = 'standard' | 'vim';
export interface SettingsData { theme: Theme; slideMs: number | null; open: boolean; keys: Keys }
export const SLIDE = { min: 0, max: 400, step: 20, default: 160 } as const;
export const DEFAULT_SETTINGS: SettingsData = { theme: 'dark', slideMs: null, open: false, keys: 'standard' };

export const clampSlide = (n: number): number =>
  Number.isFinite(n) ? Math.min(SLIDE.max, Math.max(SLIDE.min, Math.round(n))) : SLIDE.default;

/** The slide's length in ms: the user's speed, else the default, else none when the system asks for less motion. */
export const slideDuration = (slideMs: number | null, reducedMotion: boolean): number =>
  slideMs ?? (reducedMotion ? 0 : SLIDE.default);
export const SETTINGS_KEY = 'uc4-editor-settings';

/** Reads stored text; anything unexpected falls back to the default for that field. Never throws. */
export function parseSettings(text: string | null): SettingsData {
  if (!text) return { ...DEFAULT_SETTINGS };
  try {
    const o = JSON.parse(text) as (Partial<Record<keyof SettingsData, unknown>> & { animate?: unknown }) | null;
    if (typeof o !== 'object' || o === null) return { ...DEFAULT_SETTINGS };
    return {
      theme: o.theme === 'light' || o.theme === 'dark' || o.theme === 'system' ? o.theme : DEFAULT_SETTINGS.theme,
      // The old on/off checkbox (`animate`) becomes a speed: off → 0, on → the default.
      slideMs: typeof o.slideMs === 'number' ? clampSlide(o.slideMs) : o.animate === false ? 0 : null,
      open: typeof o.open === 'boolean' ? o.open : DEFAULT_SETTINGS.open,
      keys: o.keys === 'vim' || o.keys === 'standard' ? o.keys : DEFAULT_SETTINGS.keys,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export interface KeyValueStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

function browserStorage(): KeyValueStorage | null {
  try { return localStorage; } catch { return null; }
}

export function createSettings(storage: KeyValueStorage | null = browserStorage()) {
  let initial = DEFAULT_SETTINGS;
  try { initial = parseSettings(storage?.getItem(SETTINGS_KEY) ?? null); } catch { /* blocked: defaults */ }
  const data = $state<SettingsData>(initial);
  const save = (): void => {
    try { storage?.setItem(SETTINGS_KEY, JSON.stringify(data)); } catch { /* the choice lasts until the tab closes */ }
  };
  return {
    get theme() { return data.theme; },
    get slideMs() { return data.slideMs; },
    get open() { return data.open; },
    get keys() { return data.keys; },
    setKeys(keys: Keys): void { data.keys = keys; save(); },
    setTheme(theme: Theme): void { data.theme = theme; save(); },
    setSlideMs(ms: number): void { data.slideMs = clampSlide(ms); save(); },
    setOpen(open: boolean): void { data.open = open; save(); },
    toggle(): void { data.open = !data.open; save(); },
  };
}
export type Settings = ReturnType<typeof createSettings>;

export const SETTINGS_CONTEXT = Symbol('uc4-settings');
export const useSettings = (): Settings => getContext<Settings>(SETTINGS_CONTEXT);
