// The one key table (plan 0006 decisions 41, 42): the handlers match key presses against it and the key help
// ("Keys", opened with `?`) lists it, so the two cannot drift. Rows without `presses` are keys that a control
// handles on its own (a list, a field, a dialog); they are listed for the help only.

export type KeySection = 'setups' | 'groups' | 'controls' | 'copy' | 'dialogs' | 'send' | 'anywhere';

/** One key press that triggers a row. `alt` and `shift` left out = ignored (character keys depend on the layout: `{` is Option + 8 on a German Mac). */
export interface Press { key: string; /** Which way the press goes: -1 previous / left / up, 1 next / right / down. */ dir?: -1 | 1; dirName?: 'left' | 'right' | 'up' | 'down'; cmd?: boolean; alt?: boolean; shift?: boolean }

export interface KeyRow {
  id: string;
  section: KeySection;
  /** What the key help shows: one chip per key of the combination. */
  chips: string[];
  action: string;
  /** Shown only when the Vim option is on. */
  vim?: boolean;
  /** The presses a handler matches; `presses[i]` says which way (for example previous, next). */
  presses?: Press[];
}

const DIR = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 } as const;
const arrow = (key: keyof typeof DIR, alt?: boolean): Press => ({ key, cmd: false, alt: alt ?? false, shift: false, dir: DIR[key], dirName: key.slice(5).toLowerCase() as Press['dirName'] });

export const KEY_ROWS = [
  { id: 'setupPick', section: 'setups', chips: ['↑', '↓'], action: 'Select the previous or next setup' },
  { id: 'setupEnds', section: 'setups', chips: ['Home', 'End'], action: 'Select the first or last setup' },
  { id: 'setupRename', section: 'setups', chips: ['F2'], action: 'Rename the selected setup' },
  { id: 'setupRenameEnd', section: 'setups', chips: ['Enter', 'Esc'], action: 'Keep the new name, or leave it as it was' },

  { id: 'encoderGroup', section: 'groups', chips: ['(', ')'], action: 'Previous or next encoder group', presses: [{ key: '(', dir: -1 }, { key: ')', dir: 1 }] },
  { id: 'faderButtonGroup', section: 'groups', chips: ['{', '}'], action: 'Previous or next fader/button group', presses: [{ key: '{', dir: -1 }, { key: '}', dir: 1 }] },
  { id: 'controlGroup', section: 'groups', chips: ['Option', '← →'], action: 'Step the group of the selected control', presses: [arrow('ArrowLeft', true), arrow('ArrowRight', true)] },
  { id: 'shiftClick', section: 'groups', chips: ['Shift', 'click'], action: 'On encoder n: encoder group n; on green button n: fader/button group n (as on the UC4)' },
  { id: 'shiftEnter', section: 'groups', chips: ['Shift', 'Enter'], action: 'The same, on the focused encoder or green button' },

  { id: 'controlMove', section: 'controls', chips: ['←', '↑', '→', '↓'], action: 'Move between controls', presses: [arrow('ArrowLeft'), arrow('ArrowRight'), arrow('ArrowUp'), arrow('ArrowDown')] },
  { id: 'controlSelect', section: 'controls', chips: ['Enter', 'Space'], action: 'Edit the focused control' },
  { id: 'controlLeave', section: 'controls', chips: ['Esc'], action: 'Leave edit mode' },
  { id: 'areaNext', section: 'controls', chips: ['Tab'], action: 'Move to the next area' },

  { id: 'copy', section: 'copy', chips: ['Cmd', 'C'], action: 'Copy the setup, group or control in the area you work in', presses: [{ key: 'c', cmd: true, alt: false, shift: false }] },
  { id: 'paste', section: 'copy', chips: ['Cmd', 'V'], action: 'Paste it onto the one you work on', presses: [{ key: 'v', cmd: true, alt: false, shift: false }] },
  { id: 'vimCopy', section: 'copy', chips: ['y'], action: 'Copy (Vim)', vim: true, presses: [{ key: 'y', cmd: false, alt: false, shift: false }] },
  { id: 'vimPaste', section: 'copy', chips: ['p'], action: 'Paste (Vim)', vim: true, presses: [{ key: 'p', cmd: false, alt: false, shift: false }] },
  { id: 'copyStop', section: 'copy', chips: ['Esc'], action: 'Cancel pasting; Esc again leaves edit mode' },

  { id: 'dialogClose', section: 'dialogs', chips: ['Esc'], action: 'Close a question or panel; nothing changes' },
  { id: 'dialogPress', section: 'dialogs', chips: ['Tab', 'Enter'], action: 'Move to a button, press it' },

  { id: 'sendClose', section: 'send', chips: ['Esc'], action: 'Close the Send or Restore window; nothing is sent until you press Send or Restore' },

  { id: 'undo', section: 'anywhere', chips: ['Cmd', 'Z'], action: 'Undo', presses: [{ key: 'z', cmd: true, alt: false, shift: false }] },
  { id: 'redo', section: 'anywhere', chips: ['Shift', 'Cmd', 'Z'], action: 'Redo', presses: [{ key: 'z', cmd: true, alt: false, shift: true }] },
  { id: 'settings', section: 'anywhere', chips: ['Cmd', ','], action: 'Open or close Settings', presses: [{ key: ',', cmd: true }] },
  { id: 'keys', section: 'anywhere', chips: ['?'], action: 'Show these keys (outside text fields)', presses: [{ key: '?' }] },
] as const satisfies readonly KeyRow[];

export type KeyId = (typeof KEY_ROWS)[number]['id'];

export const SECTION_TITLES: Record<KeySection, string> = {
  setups: 'Setups', groups: 'Groups', controls: 'Controls', copy: 'Copy and paste', dialogs: 'Dialogs', send: 'Send', anywhere: 'Anywhere',
};
export const SECTION_ORDER: readonly KeySection[] = ['setups', 'groups', 'controls', 'copy', 'dialogs', 'send', 'anywhere'];

export interface KeyEventLike { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }

function pressMatches(p: Press, e: KeyEventLike): boolean {
  if (e.key.toLowerCase() !== p.key.toLowerCase()) return false;
  if (!!p.cmd !== (e.metaKey || e.ctrlKey)) return false;
  if (p.alt !== undefined && p.alt !== e.altKey) return false;
  if (p.shift !== undefined && p.shift !== e.shiftKey) return false;
  return true;
}

/** Which of `ids` the key press is, and the press that matched (with its direction). Null when none. */
export function matchKey(e: KeyEventLike, ids: readonly KeyId[], vim = true): { id: KeyId; index: number; press: Press } | null {
  for (const id of ids) {
    const row = (KEY_ROWS as readonly KeyRow[]).find((r) => r.id === id);
    if (!row?.presses || (row.vim && !vim)) continue;
    const index = row.presses.findIndex((p) => pressMatches(p, e));
    if (index >= 0) return { id, index, press: row.presses[index]! };
  }
  return null;
}

/** The rows the help shows: Vim rows only with Vim keys on; empty sections are left out. */
export function helpSections(vim: boolean): { section: KeySection; title: string; rows: readonly KeyRow[] }[] {
  const rows = (KEY_ROWS as readonly KeyRow[]).filter((r) => vim || !r.vim);
  return SECTION_ORDER
    .map((section) => ({ section, title: SECTION_TITLES[section], rows: rows.filter((r) => r.section === section) }))
    .filter((s) => s.rows.length > 0);
}
