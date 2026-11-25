// What the UC4's display shows in edit mode (plan 0006 decision 26; docs/reference/uc4-device.md "What the
// display shows in edit mode"): the picked control's name, or the focused property's value as the device writes it.
// Device profile data. Tested as data.
import type { ControlArea } from '../../storage/index.ts';
import { deviceName } from './uc4Hints.ts';
import { FIELDS, type PropertyKey } from './uc4Properties.ts';

const pad = (n: number, width: number): string => String(Math.trunc(n)).padStart(width, '0');

/** The display's text: `Enc3` for a control with no property focused, `Ch05`, `n064`, `Std`… for a focused property, `----` for one this control kind lacks. */
export function editDisplayText(area: ControlArea, index: number, control: Partial<Record<PropertyKey, string | number>>, property: PropertyKey | null): string {
  if (property === null) return deviceName(area, index);
  if (!FIELDS[area].some((f) => f.key === property)) return '----';
  const value = control[property];
  if (value === undefined) return '----';
  switch (property) {
    case 'channel': return `Ch${pad(Number(value), 2)}`;
    case 'number': return `n${pad(Number(value), 3)}`;
    case 'lower': return `L${pad(Number(value), 3)}`;
    case 'upper': return `U${pad(Number(value), 3)}`;
    default: return String(value);
  }
}

// Letters the display draws as capitals in a name (`SEnd`, `GrP1`, `FiLt`, `GLOb`, `traC`); b d h n r t are drawn small. Taken from the
// glyph table in uc4Segments.ts (c = adef is a C, o = abcdef an O); the glyph table wins over the manual's typography
// (`traC`, `RAC`). `m` stays small until the user has looked (UNSEEN_GLYPHS).
const CAPITAL = new Set([...'acefgjlopsuyz']);

/** A group name the way the UC4's display shows it: the editor keeps lower case (`send`), the display writes `SEnd`. */
export const spellName = (name: string): string => [...name].map((c) => (CAPITAL.has(c) ? c.toUpperCase() : c)).join('');

/** A change as the dialog lists it (decision 34): a group-name change spells both names as the display shows them; other texts already use the device's codes. */
/** A name as the display shows it; four blanks show nothing, so the line says `(blank)` (uc4-ui-design: words). */
const shownName = (name: string): string => (name.trim() === '' ? '(blank)' : spellName(name.trimEnd()));

/** Both names of a change; blanks at the end are left out, unless that would make the two look equal (then they show as `·`). */
function shownNames(from: string, to: string): string {
  const same = from.trimEnd() === to.trimEnd() && from !== to;
  const one = (n: string): string => (same ? spellName(n).replace(/ +$/, (b) => '·'.repeat(b.length)) : shownName(n));
  return `${one(from)} → ${one(to)}`;
}

export function spellChange(item: { text: string; name?: { group: number; from: string; to: string } }): string {
  return item.name ? `Encoder group ${item.name.group}: name ${shownNames(item.name.from, item.name.to)}` : item.text;
}
