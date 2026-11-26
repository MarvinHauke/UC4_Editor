// Warnings in the page (plan 0008 decision 7, step 5): which control a warning is about, which warnings the open setup has.
// A warning is not a problem: it blocks nothing and has its own mark and colour. Pure; the model finds them (`warnings`).
import { warnings, type Uc4Config, type Warning } from '../model/index.ts';
import type { ControlArea } from '../storage/index.ts';

export interface ControlPlace { setupIndex: number; area: ControlArea; group: number; index: number }

/** `setups[2].encoderGroups[0].encoders[3]` → where that control is; null for any other path. */
export function parseControlPath(path: string): ControlPlace | null {
  const m = /^setups\[(\d+)\]\.(?:encoderGroups|faderButtonGroups)\[(\d+)\]\.(encoders|pushButtons|faders|buttons)\[(\d+)\]$/.exec(path);
  return m ? { setupIndex: Number(m[1]), group: Number(m[2]), area: m[3] as ControlArea, index: Number(m[4]) } : null;
}

/**
 * The warnings the page shows for one setup. Step 6 filters the waived ones here, so this is the one place to change:
 * the status bar, the control marks and the property panel all read through it.
 */
export function visibleWarnings(all: readonly Warning[]): Warning[] {
  return [...all];
}

export function setupWarnings(config: Uc4Config, setupId: string): Warning[] {
  return visibleWarnings(warnings(config).filter((w) => w.setupId === setupId));
}

/** The warnings that name this control. */
export function warningsOf(list: readonly Warning[], path: string): Warning[] {
  return list.filter((w) => w.controls[0] === path || w.controls[1] === path);
}

/** A warning's identity across list changes (the stepper keeps its place). */
export const warningKey = (w: Warning): string => `${w.controls[0]}\u0000${w.controls[1]}\u0000${w.key.kind}:${w.key.channel}:${w.key.number ?? ''}`;

/** The stepper's new index after the list changed: the same warning keeps its place, otherwise it starts over. */
export function relocateWarning(list: readonly Warning[], at: number, key: string | null): number {
  if (list.length === 0 || at < 0 || key === null) return -1;
  return list.findIndex((w) => warningKey(w) === key);
}
