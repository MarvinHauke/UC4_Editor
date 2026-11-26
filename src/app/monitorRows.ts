// What the MIDI monitor shows for a row, and the remembered input choice (plan 0008 step 1, decisions 3 and 19).
// Pure: no Svelte, no DOM. Raw values only; pairs, "+1/−1" and matches come with later steps.
import type { LiveRow, MessageKind } from '../live/index.ts';
import type { InputInfo, InputSelection } from '../midi/inputs.ts';

export const INPUT_KEY = 'uc4-editor-monitor-input';

/** Short words per kind; the device's own words (`CCAb`, `notE`) appear with the match in step 2. */
const KIND_LABEL: Record<MessageKind, string> = {
  cc: 'CC', note: 'Note', program: 'Prog', pitchBend: 'Bend', aftertouch: 'Touch', polyAftertouch: 'Poly',
};

export interface RowText { message: string; channel: string }

export function rowText(row: Pick<LiveRow, 'kind' | 'channel' | 'number'>): RowText {
  const kind = KIND_LABEL[row.kind];
  return { message: row.number === null ? kind : `${kind} ${row.number}`, channel: String(row.channel) };
}

/** One sentence for screen readers and the tooltip; `source` is the input's name. */
export function rowLabel(row: LiveRow, source: string): string {
  const t = rowText(row);
  const match = row.best ? `, ${row.best.control.name}${row.pinned ? ' (pinned)' : ''}${row.more > 0 ? `, ${row.more} more` : ''}` : '';
  return `${t.message} ch ${t.channel}, ${row.valueText}, from ${source}${row.isUc4 ? ' (the UC4)' : ''}${match}`;
}

/** The input's name for a row: the plugged-in input's name, else a plain note (the row outlives its input). */
export function sourceName(row: Pick<LiveRow, 'inputId'>, inputs: readonly InputInfo[]): string {
  const i = inputs.find((x) => x.id === row.inputId);
  return i ? i.name || i.id : 'an input that is not connected';
}

export interface KeyValueStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

function browserStorage(): KeyValueStorage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** The remembered choice; anything missing or blocked is "all". Never throws. */
export function loadSelection(storage: KeyValueStorage | null = browserStorage()): InputSelection {
  try {
    const v = storage?.getItem(INPUT_KEY);
    return typeof v === 'string' && v !== '' ? v : 'all';
  } catch { return 'all'; }
}

export function saveSelection(selection: InputSelection, storage: KeyValueStorage | null = browserStorage()): void {
  try { storage?.setItem(INPUT_KEY, selection); } catch { /* blocked or full: the choice just isn't remembered */ }
}

export interface PickerOption { value: InputSelection; label: string }

/** The picker's options: "All inputs", every input, and the remembered one when it isn't plugged in (so the select never lies). */
export function pickerOptions(inputs: readonly InputInfo[], selection: InputSelection): PickerOption[] {
  const options: PickerOption[] = [{ value: 'all', label: 'All inputs' }];
  for (const i of inputs) options.push({ value: i.id, label: i.isUc4 ? `${i.name} (UC4)` : i.name || i.id });
  if (selection !== 'all' && !inputs.some((i) => i.id === selection)) options.push({ value: selection, label: 'Chosen input (not connected)' });
  return options;
}
