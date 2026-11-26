// Warnings in the page (plan 0008 decision 7, step 5): which control a warning is about, which warnings the open setup has.
// A warning is not a problem: it blocks nothing and has its own mark and colour. Pure; the library lists them with their state (`state.warnings`).
import type { Warning } from '../model/index.ts';
import type { ControlArea } from '../storage/index.ts';

export interface ControlPlace { setupIndex: number; area: ControlArea; group: number; index: number }

/** `setups[2].encoderGroups[0].encoders[3]` → where that control is; null for any other path. */
export function parseControlPath(path: string): ControlPlace | null {
  const m = /^setups\[(\d+)\]\.(?:encoderGroups|faderButtonGroups)\[(\d+)\]\.(encoders|pushButtons|faders|buttons)\[(\d+)\]$/.exec(path);
  return m ? { setupIndex: Number(m[1]), group: Number(m[2]), area: m[3] as ControlArea, index: Number(m[4]) } : null;
}

/** The warnings that name this control. */
export function warningsOf(list: readonly Warning[], path: string): Warning[] {
  return list.filter((w) => w.controls[0] === path || w.controls[1] === path);
}
