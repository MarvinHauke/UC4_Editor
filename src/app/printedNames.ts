// The names printed on the panel for the Ableton setups SE17/SE18 (plan 0006 decision 18, corrected): they name
// groups. A group shows its printed name only while the whole group has its factory mapping, so the name never lies.
import { factorySetup } from '../model/index.ts';
import type { Setup } from '../model/index.ts';
import type { PrintedGroupNames } from './profile/uc4PrintedNames.ts';

type Mapping = Record<string, unknown>;
const MAPPING_KEYS = ['display', 'type', 'mode', 'channel', 'number', 'lower', 'upper'] as const;

/** Whether a control still has its factory mapping (every property the kind has; the label is not part of it). */
export function equalsFactory(control: object, factory: object): boolean {
  const a = control as Mapping;
  const b = factory as Mapping;
  return MAPPING_KEYS.every((k) => a[k] === b[k]);
}
// Factory setups are built once per slot: this is called on every render.
const factories = new Map<number, Setup>();
const factoryOf = (slot: number): Setup => {
  let f = factories.get(slot);
  if (!f) { f = factorySetup(slot); factories.set(slot, f); }
  return f;
};
const sameControls = (a: readonly object[], b: readonly object[]): boolean =>
  a.length === b.length && a.every((c, i) => equalsFactory(c, b[i]!));

/**
 * The printed name of group `group` (0–7) of a setup, or undefined: when the setup is not one the print belongs to,
 * or when any control of the group differs from the factory mapping. Labels and the group's display name don't count.
 */
export function printedGroupName(
  table: PrintedGroupNames, setup: Setup, kind: 'encoder' | 'faderButton', group: number,
): string | undefined {
  const slot = setup.slot;
  const name = table[kind][group];
  if (slot === undefined || !table.slots.includes(slot) || !name) return undefined;
  const factory = factoryOf(slot);
  if (kind === 'encoder') {
    const mine = setup.encoderGroups[group];
    const fresh = factory.encoderGroups[group];
    return mine && fresh && sameControls(mine.encoders, fresh.encoders) && sameControls(mine.pushButtons, fresh.pushButtons) ? name : undefined;
  }
  const mine = setup.faderButtonGroups[group];
  const fresh = factory.faderButtonGroups[group];
  return mine && fresh && sameControls(mine.faders, fresh.faders) && sameControls(mine.buttons, fresh.buttons) ? name : undefined;
}
