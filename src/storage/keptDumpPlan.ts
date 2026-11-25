// What a kept dump is needed for, and the "clear old dumps" plan (plan 0005 decisions 6, 10, 15 and step 6).
// Pure functions: the library gives them the facts and runs the plan; they hold no state.
import { slotName } from './dumpImport.ts';

/** The part of a kept dump the plan reads (`KeptDumpInfo` fits). `date` is ISO 8601. */
export interface PlanDump { id: string; date: string; type: 'all' | 'one' | 'unknown'; slots: number[] }
/** The part of a setup the plan reads. */
export interface PlanSetup { id: string; name: string; slot?: number }
/** A setup's link to the dump it came from: the dump and the slot of it the setup came from. */
export type PlanLinks = Record<string, { dump: string; slot: number }>;

/**
 * Why a setup needs a dump:
 * - `revert`: the setup's link to the dump it came from (decision 6);
 * - `sndc-export`: the kept `Sndc` of the setup's own slot that "Export SEnn as .syx" is built on (0007 decision 16);
 * - `unreadable-values`: the setup has values the engine could not read; its `.syx` export keeps them only with this dump;
 * - `send-backup`: the last send of the setup's slot names this `SndA` as its backup; "Restore" cuts the old setup from it (plan 0005 step 14).
 */
export type NeedReason = 'revert' | 'sndc-export' | 'unreadable-values' | 'send-backup';
export interface DumpNeed { setupId: string; setupName: string; slot?: number; reasons: NeedReason[] }

/** The words the UI puts after the setup's name: "SE05 can no longer be …". */
export const NEED_TEXT: Record<NeedReason, string> = {
  'revert': 'reverted to this dump',
  'sndc-export': 'exported alone as .syx (Sndc)',
  'unreadable-values': 'exported as .syx with the values the editor could not read',
  'send-backup': 'restored from this backup',
};

const byNewest = <T extends { date: string }>(list: readonly T[]): T[] => [...list].sort((a, b) => b.date.localeCompare(a.date));

/** Per kept dump id: the setups that need it. A dump no setup needs is absent. A setup lists its reasons once. */
export function dumpNeeds(
  dumps: readonly PlanDump[], links: PlanLinks, setups: readonly PlanSetup[], markedSetupIds: ReadonlySet<string> = new Set(),
  sendBackups: Readonly<Record<number, string>> = {},
): Record<string, DumpNeed[]> {
  const out: Record<string, DumpNeed[]> = {};
  // Keyed by slot, not by the setup now in it: the backup stays when no setup holds the slot (`setupId` is '').
  for (const [n, backupId] of Object.entries(sendBackups)) {
    const slot = Number(n);
    if (!dumps.some((d) => d.id === backupId && d.type === 'all')) continue;
    const setup = setups.find((x) => x.slot === slot);
    (out[backupId] ??= []).push({ setupId: setup?.id ?? '', setupName: setup?.name ?? slotName(slot), slot, reasons: ['send-backup'] });
  }
  for (const setup of setups) {
    const link = links[setup.id];
    const dump = link && dumps.find((d) => d.id === link.dump);
    if (!link || !dump || dump.type === 'unknown') continue;
    const reasons: NeedReason[] = ['revert'];
    if (dump.type === 'one' && setup.slot !== undefined && link.slot === setup.slot && dump.slots.includes(setup.slot)) reasons.push('sndc-export');
    if (markedSetupIds.has(setup.id) && setup.slot !== undefined && link.slot === setup.slot && dump.slots.includes(setup.slot)) reasons.push('unreadable-values');
    const list = (out[dump.id] ??= []);
    const have = list.find((n) => n.setupId === setup.id);
    if (have) have.reasons.push(...reasons.filter((r) => !have.reasons.includes(r)));
    else list.push({ setupId: setup.id, setupName: setup.name, ...(setup.slot !== undefined ? { slot: setup.slot } : {}), reasons });
  }
  return out;
}

/** What a dump is, for grouping and for the dialog: `SndA`, `Sndc SE05`, `unreadable dump`. */
export function dumpKind(d: PlanDump): { key: string; label: string } {
  if (d.type === 'all') return { key: 'all', label: 'SndA' };
  if (d.type === 'one' && d.slots.length === 1) return { key: `one:${d.slots[0]}`, label: `Sndc ${slotName(d.slots[0]!)}` };
  if (d.type === 'one') return { key: `one:${d.slots.join(',')}`, label: 'Sndc' };
  return { key: 'unknown', label: 'unreadable dump' };
}

export type KeepReason = 'newest' | 'needed';
export interface ClearEntry {
  id: string;
  date: string;
  /** `SndA`, `Sndc SE05`, `unreadable dump`. */
  kind: string;
  action: 'keep' | 'delete';
  /** Why it stays: newest of its kind and slot, needed by a setup, or both. Empty for `delete`. */
  keepBecause: KeepReason[];
  /** The setups that need it (empty when none does). */
  neededBy: DumpNeed[];
  /** For `delete`: the newer dump of the same kind that stays instead. */
  supersededBy?: string;
}
/** `entries` is newest first. Nothing goes when `deleteIds` is empty ("nothing to clear"). */
export interface ClearPlan { entries: ClearEntry[]; deleteIds: string[]; keepIds: string[] }

/**
 * Keeps the newest dump of each kind (`SndA`; `Sndc` per slot; unreadable dumps as one kind) and every dump a
 * setup still needs; everything else goes. An older dump that a setup needs stays too, and the newest stays
 * whether needed or not.
 */
export function planClearOldDumps(dumps: readonly PlanDump[], needs: Record<string, DumpNeed[]>): ClearPlan {
  const sorted = byNewest(dumps);
  const newestOf = new Map<string, string>();
  for (const d of sorted) { const k = dumpKind(d).key; if (!newestOf.has(k)) newestOf.set(k, d.id); }
  const entries: ClearEntry[] = sorted.map((d) => {
    const { key, label } = dumpKind(d);
    const keepBecause: KeepReason[] = [];
    if (newestOf.get(key) === d.id) keepBecause.push('newest');
    const neededBy = needs[d.id] ?? [];
    if (neededBy.length > 0) keepBecause.push('needed');
    return {
      id: d.id, date: d.date, kind: label, action: keepBecause.length > 0 ? 'keep' : 'delete', keepBecause, neededBy,
      ...(keepBecause.length === 0 ? { supersededBy: newestOf.get(key)! } : {}),
    };
  });
  return { entries, deleteIds: entries.filter((e) => e.action === 'delete').map((e) => e.id), keepIds: entries.filter((e) => e.action === 'keep').map((e) => e.id) };
}
