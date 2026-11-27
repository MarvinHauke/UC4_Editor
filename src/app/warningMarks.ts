// Warnings in the page (plan 0008 decision 7, step 5): which control a warning is about, which warnings the open setup has.
// A warning is not a problem: it blocks nothing and has its own mark and colour. Pure; the library lists them with their state (`state.warnings`).
import { controlPathOf, parseControlPath as parsePath, type Warning } from '../model/index.ts';
import type { ControlArea } from '../storage/index.ts';

export interface ControlPlace { setupIndex: number; area: ControlArea; group: number; index: number }

/** `setups[2].encoderGroups[0].encoders[3]` → where that control is; null for any other path. */
export function controlPlaceOf(path: string): ControlPlace | null {
  const at = parsePath(path);
  // Only a whole control path: the model's parse stops where it can, so the path must come back unchanged.
  if (!at || at.area === undefined || at.group === undefined || at.index === undefined) return null;
  return controlPathOf(at.setupIndex, at.area, at.group, at.index) === path ? { setupIndex: at.setupIndex, group: at.group, area: at.area, index: at.index } : null;
}

/** The warnings that name this control. */
export function warningsOf(list: readonly Warning[], path: string): Warning[] {
  return list.filter((w) => w.controls[0] === path || w.controls[1] === path);
}
