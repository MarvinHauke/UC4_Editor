// Follow (plan 0008 decision 25, step 9): while on, a UC4 message whose best match is a control selects that control in the editor.
// Pure rules and the stored switch; the wiring (selection, focus) is in App.
import type { ControlRef, Match } from '../live/index.ts';

export const FOLLOW_KEY = 'uc4-editor-follow';

export interface FollowStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const browserStorage = (): FollowStorage | null => { try { return localStorage; } catch { return null; } };

export function loadFollow(storage: FollowStorage | null = browserStorage()): boolean {
  try { return storage?.getItem(FOLLOW_KEY) === '1'; } catch { return false; }
}
export function saveFollow(on: boolean, storage: FollowStorage | null = browserStorage()): void {
  try { storage?.setItem(FOLLOW_KEY, on ? '1' : '0'); } catch { /* it lasts until the tab closes */ }
}

/** Whether an element is a field the user may be typing in. */
export function isEditingField(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable === true;
}

export interface FollowSelection { setupId: string; encoderGroup: number; faderButtonGroup: number; control: { area: string; index: number } | null }

/** The match Follow selects for a touched control, or null when it is selected already (same setup, its group and the control itself). */
export function followTarget(sel: FollowSelection, control: ControlRef): Match | null {
  const group = control.area === 'encoders' || control.area === 'pushButtons' ? sel.encoderGroup : sel.faderButtonGroup;
  if (sel.setupId === control.setupId && group === control.group && sel.control?.area === control.area && sel.control.index === control.index) return null;
  return { control, tier: 1, via: 'message' };
}

/** Follow selects only when it is on, Map is not armed (Map by touch wins) and no property field has focus. */
export function shouldFollow(s: { on: boolean; armed: boolean; fieldFocused: boolean }): boolean {
  return s.on && !s.armed && !s.fieldFocused;
}
