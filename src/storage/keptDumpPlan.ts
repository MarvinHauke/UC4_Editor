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

/** Why a dump stays: `backup` is the newest received `SndA` (what Restore and the send's base read); `needed` a setup needs it. */
export type KeepReason = 'backup' | 'needed';
export interface ClearEntry {
  id: string;
  date: string;
  /** `SndA`, `Sndc SE05`, `unreadable dump`. */
  kind: string;
  /** `keep`: the dump stays and is hidden from the list; `delete`: nothing needs it. */
  action: 'keep' | 'delete';
  /** Why it stays (empty for `delete`). */
  keepBecause: KeepReason[];
  /** The setups that need it (empty when none does). */
  neededBy: DumpNeed[];
}
/** `entries` is newest first. Every id in `keepIds` is hidden by the clear; `hideIds` are those not hidden yet. Nothing to clear when `deleteIds` and `hideIds` are both empty. */
export interface ClearPlan { entries: ClearEntry[]; deleteIds: string[]; keepIds: string[]; hideIds: string[] }

/** Whether the clear has anything to do: a dump to delete or one to hide. */
export const hasWorkToClear = (plan: Pick<ClearPlan, 'deleteIds' | 'hideIds'>): boolean => plan.deleteIds.length > 0 || plan.hideIds.length > 0;

/** The part of a kept dump the backup rule reads: `received` is when the UC4 sent it (absent for a dump only imported from a file). */
export interface BackupCandidate extends PlanDump { received?: string; unreadable?: boolean; /** Already hidden by an earlier clear. */ hidden?: boolean }

/**
 * The dump Restore and the send's base read when no send names another: the newest readable `SndA` the UC4 sent
 * (`freshBackup` in sendPlan.ts picks the same one among those received since the connection). An imported file is
 * never a backup, so it is not kept for being one.
 */
export function newestBackupId(dumps: readonly BackupCandidate[]): string | undefined {
  let best: BackupCandidate | undefined;
  for (const d of dumps) {
    if (d.type !== 'all' || d.unreadable || d.received === undefined) continue;
    if (!best || d.received > best.received!) best = d;
  }
  return best?.id;
}

/**
 * Plan 0010 decision 8: every dump nothing needs goes, the newest `Sndc` of a slot too. What stays is the newest
 * received `SndA` and every dump a setup needs (Revert, `Sndc` export, the send's base, a send's backup); the library
 * hides what stays.
 */
export function planClearOldDumps(dumps: readonly BackupCandidate[], needs: Record<string, DumpNeed[]>): ClearPlan {
  const backup = newestBackupId(dumps);
  const hiddenIds = new Set(dumps.filter((d) => d.hidden).map((d) => d.id));
  const entries: ClearEntry[] = byNewest(dumps).map((d) => {
    const keepBecause: KeepReason[] = [];
    if (backup === d.id) keepBecause.push('backup');
    const neededBy = needs[d.id] ?? [];
    if (neededBy.length > 0) keepBecause.push('needed');
    return { id: d.id, date: d.date, kind: dumpKind(d).label, action: keepBecause.length > 0 ? 'keep' : 'delete', keepBecause, neededBy };
  });
  return { entries, deleteIds: entries.filter((e) => e.action === 'delete').map((e) => e.id), keepIds: entries.filter((e) => e.action === 'keep').map((e) => e.id),
    hideIds: entries.filter((e) => e.action === 'keep' && !hiddenIds.has(e.id)).map((e) => e.id) };
}
