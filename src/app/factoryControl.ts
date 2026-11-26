// Clear a colliding mapping (plan 0008 decision 26, step 11): the factory control of a slot, group and control, the words for
// the result line, and the check whether a control stands in a warning. Pure; the library applies the edit (`setControl`).
import { factorySetup, type Uc4Config, type Warning } from '../model/index.ts';
import type { AnyControl, ControlArea } from '../storage/index.ts';
import { controlPath } from './controlProblems.ts';
import { glyphNumber } from './glyphText.ts';
import { warningsOf } from './warningMarks.ts';

export interface ControlSpot { setupId: string; area: ControlArea; group: number; index: number }

/** The factory control for a setup slot (1–18) at a group and index; null when the slot or place does not exist. */
export function factoryControl(slot: number | undefined, area: ControlArea, group: number, index: number): AnyControl | null {
  if (slot === undefined || !Number.isInteger(slot) || slot < 1 || slot > 18) return null;
  const setup = factorySetup(slot);
  const g = area === 'encoders' || area === 'pushButtons' ? setup.encoderGroups[group] : setup.faderButtonGroups[group];
  const list = (g as unknown as Record<string, AnyControl[] | undefined> | undefined)?.[area];
  return list?.[index] ?? null;
}

/** What the reset puts in, with the result line: "FAd1 · FG1 back to factory: CCAb 32 ch1". Null when the control or its slot is unknown. */
export function factoryReset(configuration: Uc4Config, spot: ControlSpot, name: string): { control: AnyControl; text: string } | null {
  const setup = configuration.setups.find((s) => s.id === spot.setupId);
  const control = factoryControl(setup?.slot, spot.area, spot.group, spot.index);
  if (!control) return null;
  const c = control as { type: string; number: number; channel: number; lower?: number; upper?: number };
  const sends = `${c.type} ${glyphNumber(spot.area, c)}`.trim();
  return { control, text: `${name} back to factory: ${sends} ch${c.channel}` };
}

/** Whether the control is one of the two in any warning (ignored or not: pass the full list). */
export function isWarned(configuration: Uc4Config, warnings: readonly Warning[], spot: ControlSpot): boolean {
  const i = configuration.setups.findIndex((s) => s.id === spot.setupId);
  return i >= 0 && warningsOf(warnings, controlPath(i, spot.area, spot.group, spot.index)).length > 0;
}
