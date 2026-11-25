// Group stepping for the two carousels (plan 0006 decisions 7 and 9). Pure, so it is tested without a component.
import { matchKey, type KeyEventLike } from './keyTable.ts';

export const GROUP_COUNT = 8;
export type GroupKind = 'encoder' | 'faderButton';

/** The group `delta` steps from `group`, wrapping around: after 8 comes 1. */
export const stepGroup = (group: number, delta: number): number => (((group + delta) % GROUP_COUNT) + GROUP_COUNT) % GROUP_COUNT;

/** The group kind a control's section belongs to: encoders and push buttons, or faders and green buttons. */
export const kindOfArea = (area: string): GroupKind | null =>
  area === 'encoders' || area === 'pushButtons' ? 'encoder' : area === 'faders' || area === 'buttons' ? 'faderButton' : null;

/** The group step a key press asks for, from the key table: `( )` encoder groups, `{ }` fader/button groups, Option + ← → the selected control's group. */
export function groupAction(e: KeyEventLike, selectedArea: string | null): { kind: GroupKind; delta: 1 | -1 } | null {
  const hit = matchKey(e, ['encoderGroup', 'faderButtonGroup', 'controlGroup']);
  if (!hit) return null;
  const delta = hit.press.dir === 1 ? 1 : -1;
  if (hit.id === 'encoderGroup') return { kind: 'encoder', delta };
  if (hit.id === 'faderButtonGroup') return { kind: 'faderButton', delta };
  const kind = selectedArea === null ? null : kindOfArea(selectedArea);
  return kind ? { kind, delta } : null;
}
