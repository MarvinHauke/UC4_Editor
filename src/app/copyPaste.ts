// Copy / Paste in the UI (plan 0006 decisions 30–34): what is held, which items can take a paste, which area a key
// belongs to. Plain functions, tested as data. The library does the pasting; this only decides what the UI offers.
import type { ControlArea } from '../storage/index.ts';
import { matchKey, type KeyEventLike } from './keyTable.ts';
import { CROSSFADER } from './profile/uc4Geometry.ts';

/** What the user copied. A group or control is held with its setup, so it pastes across setups. */
export type Held =
  | { kind: 'setup'; setupId: string }
  | { kind: 'encoderGroup' | 'faderButtonGroup'; setupId: string; group: number }
  | { kind: 'control'; setupId: string; area: ControlArea; group: number; index: number };

/** Fader 9 (index 8, the crossfader) is its own kind: only onto fader 9; faders 1–8 only onto faders 1–8. */
export function canPasteControl(from: { area: ControlArea; index: number }, to: { area: ControlArea; index: number }): boolean {
  if (from.area !== to.area) return false;
  return from.area !== 'faders' || (from.index === CROSSFADER) === (to.index === CROSSFADER);
}

/** The same control: it stays bright and takes no paste. */
export const isHeldControl = (held: Held | null, setupId: string, area: ControlArea, group: number, index: number): boolean =>
  held?.kind === 'control' && held.setupId === setupId && held.area === area && held.group === group && held.index === index;

/** The three levels a copy or paste works on. */
export type Level = 'setup' | 'group' | 'control';

/** True for a place where Cmd-C / Cmd-V / y / p are text keys. */
export function isTextTarget(target: unknown): boolean {
  const t = target as { closest?: (s: string) => unknown } | null;
  return !!t?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
}

/** The level of a key press, by the area that has the focus (`data-copy-level` on the setup list, the groups header and the device/property areas). */
export function levelOf(target: unknown, hasControl: boolean): Level | null {
  const t = target as { closest?: (s: string) => { getAttribute: (n: string) => string | null } | null } | null;
  const at = t?.closest?.('[data-copy-level]')?.getAttribute('data-copy-level') ?? null;
  if (at === 'setup') return 'setup';
  if (at === 'group') return 'group';
  // The device view and the property panel work on the picked control, else on the group on show.
  if (at === 'control') return hasControl ? 'control' : 'group';
  return null;
}

/** The held level, for matching it with a key's level (a paste is only offered for what was copied). */
export const levelOfHeld = (held: Held): Level => (held.kind === 'setup' ? 'setup' : held.kind === 'control' ? 'control' : 'group');

/** Which key does what, from the key table: Cmd/Ctrl-C and Cmd/Ctrl-V always; `y` and `p` with no modifier in Vim keys. */
export function copyKey(e: KeyEventLike, vim: boolean): 'copy' | 'paste' | null {
  const hit = matchKey(e, ['copy', 'paste', 'vimCopy', 'vimPaste'], vim);
  return hit ? (hit.id === 'copy' || hit.id === 'vimCopy' ? 'copy' : 'paste') : null;
}
