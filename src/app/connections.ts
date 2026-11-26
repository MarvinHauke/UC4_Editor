// The words and rules behind the Connections column (plan 0005 step 7, decisions 11–15). Plain functions, tested as data.
import type { ConnectionState } from '../midi/connection.ts';
import type { ClearPlan, DumpNeed, KeptDumpInfo } from '../storage/index.ts';
import { NEED_TEXT } from '../storage/index.ts';
import type { ConfirmSpec } from './confirmSpec.ts';
import { formatExported, slotName } from './format.ts';
import { CONNECTIONS_KEY } from './storageKeys.ts';

export { CONNECTIONS_KEY };
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

/** The 5 newest visible dumps (a hidden one stays out of the list), or, with Show all, every dump including the hidden ones. */
export const shownDumps = <T extends { hidden?: true }>(dumps: readonly T[], all: boolean): readonly T[] => (all ? dumps : dumps.filter((d) => !d.hidden).slice(0, NEWEST_SHOWN));

/** Why a hidden dump stays, in dim text under Show all: "backup", "kept for SE05, SE09", or both. Empty for a visible dump. */
export function keptNote(d: Pick<KeptDumpInfo, 'keptFor'>): string {
  return keptBecause(d.keptFor?.backup === true, d.keptFor?.setups ?? []);
}
const setupLabel = (n: DumpNeed): string => (n.slot !== undefined ? slotName(n.slot) : n.setupName);
/** Up to 4 setups are named, in slot order; more are counted ("kept for 18 setups"). */
const MAX_NAMED = 4;
function keptBecause(backup: boolean, setups: readonly DumpNeed[]): string {
  const sorted = [...setups].sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99));
  const names = sorted.length > MAX_NAMED ? `${sorted.length} setups` : sorted.map(setupLabel).join(', ');
  return [backup ? 'backup' : '', sorted.length > 0 ? `kept for ${names}` : ''].filter(Boolean).join(' / ');
}

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

/** The question before "Clear old dumps": what goes and what is kept, hidden. The list ends up empty; Show all brings the kept ones back. Not undoable. */
export function clearTexts(plan: ClearPlan): Omit<ConfirmSpec, 'run'> {
  const line = (e: ClearPlan['entries'][number]): string => {
    const when = formatExported(e.date);
    if (e.action === 'delete') return `Goes: ${e.kind}, ${when}`;
    return `Kept, hidden: ${e.kind}, ${when} (${keptBecause(e.keepBecause.includes('backup'), e.neededBy)})`;
  };
  const gone = plan.deleteIds.length;
  const backup = plan.entries.some((e) => e.action === 'keep' && e.keepBecause.includes('backup'));
  const needed = plan.entries.some((e) => e.action === 'keep' && e.neededBy.length > 0);
  const stays = [backup ? 'your backup for Restore' : '', needed ? 'the dumps setups need' : ''].filter(Boolean).join(' and ');
  return {
    title: gone > 0 ? `Clear ${plural(gone, 'old dump')}?` : 'Clear the dump list?',
    body: [
      gone > 0 ? `Lost for good: ${plural(gone, 'dump')} and ${gone === 1 ? 'its' : 'their'} bytes. The list will be empty.` : 'Nothing is deleted. The list will be empty.',
      plan.keepIds.length > 0 ? `${plural(plan.keepIds.length, 'dump')} ${plan.keepIds.length === 1 ? 'stays' : 'stay'}, hidden: ${stays}. Show all brings ${plan.keepIds.length === 1 ? 'it' : 'them'} back.` : '',
      gone > 0 ? 'This cannot be undone. Export a dump first with Export .syx if you want a copy.' : '',
    ].filter(Boolean),
    list: plan.entries.map(line),
    confirmLabel: gone > 0 ? 'Clear old dumps' : 'Clear the list',
  };
}
