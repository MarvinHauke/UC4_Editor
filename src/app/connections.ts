// The words and rules behind the Connections column (plan 0005 step 7, decisions 11–15). Plain functions, tested as data.
import type { ConnectionState } from '../midi/connection.ts';
import type { ClearPlan, DumpNeed, KeptDumpInfo } from '../storage/index.ts';
import { NEED_TEXT } from '../storage/index.ts';
import type { ConfirmSpec } from './confirmSpec.ts';
import { formatExported, slotName } from './format.ts';

export const CONNECTIONS_KEY = 'uc4-editor-connections-open';
/** From this window width the open column pushes the layout; below it slides over the properties column (1024 px keeps its fit). */
export const WIDE_PX = 1320;
export const NEWEST_SHOWN = 5;

export interface KeyValueStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const browserStorage = (): KeyValueStorage | null => { try { return localStorage; } catch { return null; } };

/** Open or closed, remembered per viewer; closed when nothing is stored or storage is blocked. Never throws. */
export function loadOpen(storage: KeyValueStorage | null = browserStorage()): boolean {
  try { return storage?.getItem(CONNECTIONS_KEY) === 'open'; } catch { return false; }
}
export function saveOpen(open: boolean, storage: KeyValueStorage | null = browserStorage()): void {
  try { storage?.setItem(CONNECTIONS_KEY, open ? 'open' : 'closed'); } catch { /* lasts until the tab closes */ }
}

export interface StripInfo { text: string; tone: 'on' | 'off' | 'warn'; label: string }

/** What the collapsed strip shows: the UC4's state in words, and the full sentence for the accessible name. */
export function stripInfo(deviceName: string, state: ConnectionState, waiting: number): StripInfo {
  const word = state.kind === 'connected' ? 'connected' : state.kind === 'choose-port' ? 'pick a port' : state.kind === 'denied' ? 'blocked' : state.kind === 'unsupported' ? 'unsupported' : 'not connected';
  const tone = state.kind === 'connected' ? 'on' : state.kind === 'choose-port' || state.kind === 'denied' ? 'warn' : 'off';
  const dumps = waiting > 0 ? `, ${waiting} dump${waiting === 1 ? '' : 's'} received` : '';
  return { text: `${deviceName} ${word}`, tone, label: `Connections: ${deviceName} ${word}${dumps}` };
}

/** "Sndc SE05", "SndA": what a kept dump is, in the device's words. */
export function dumpKindLabel(d: Pick<KeptDumpInfo, 'type' | 'slots'>): string {
  if (d.type === 'all') return 'SndA';
  if (d.type === 'one') return d.slots.length === 1 ? `Sndc ${slotName(d.slots[0]!)}` : 'Sndc';
  return 'unreadable dump';
}

/** A list row: the kind, and "received · time" or "file name · time". */
export function keptRow(d: KeptDumpInfo): { kind: string; meta: string } {
  const from = d.source === 'received' ? 'received' : d.fileName ?? 'file';
  return { kind: dumpKindLabel(d), meta: `${from} · ${formatExported(d.date)}` };
}

/** The 5 newest, or all. */
export const shownDumps = <T>(dumps: readonly T[], all: boolean): readonly T[] => (all ? dumps : dumps.slice(0, NEWEST_SHOWN));

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
const needLine = (n: DumpNeed): string => `${n.slot !== undefined ? `${slotName(n.slot)} ` : ''}"${n.setupName}" can no longer be ${n.reasons.map((r) => NEED_TEXT[r]).join(' or ')}.`;

/** The question before deleting a dump a setup needs: names each setup and what stops working. Not undoable. */
export function deleteNeededTexts(d: KeptDumpInfo, needs: readonly DumpNeed[]): Omit<ConfirmSpec, 'run'> {
  return {
    title: `Delete the kept dump (${d.content}, ${formatExported(d.date)})?`,
    body: ['Lost for good: the dump and its bytes. Setups need it:', 'This cannot be undone. Export it first with Export .syx if you want a copy.'],
    list: needs.map(needLine),
    confirmLabel: 'Delete dump',
  };
}

/** The question before "Clear old dumps": what goes, what stays and why. Not undoable. */
export function clearTexts(plan: ClearPlan): Omit<ConfirmSpec, 'run'> {
  const line = (e: ClearPlan['entries'][number]): string => {
    const when = formatExported(e.date);
    if (e.action === 'delete') return `Goes: ${e.kind}, ${when} (a newer ${e.kind} stays)`;
    const why = [e.keepBecause.includes('newest') ? 'the newest of its kind' : '', e.neededBy.length ? `needed by ${e.neededBy.map((n) => n.slot !== undefined ? slotName(n.slot) : n.setupName).join(', ')}` : ''].filter(Boolean).join('; ');
    return `Stays: ${e.kind}, ${when} (${why})`;
  };
  return {
    title: `Clear ${plural(plan.deleteIds.length, 'old dump')}?`,
    body: [
      `Lost for good: ${plural(plan.deleteIds.length, 'dump')} and their bytes. ${plural(plan.keepIds.length, 'dump')} stay: the newest of each kind and slot, and every dump a setup still needs (Revert, Sndc export).`,
      'This cannot be undone. Export a dump first with Export .syx if you want a copy.',
    ],
    list: plan.entries.map(line),
    confirmLabel: 'Clear old dumps',
  };
}
