// Plan a restore (plan 0005 step 14, decisions 28, 31): which backup `SndA` holds the old setup of a slot, and what the
// UC4 holds now. Pure: the library cuts the bytes and lists the changes; nothing here sends or changes anything.
import { slotName } from './dumpImport.ts';
import { freshBackup, receivedAtOf, type SendBackup, type SendChanges } from './sendPlan.ts';
import type { StoredDump } from './storage.ts';

/** What the library remembers of the last send of one slot (kept beside the library, not in the uc4-config JSON). */
export interface LastSend {
  /** ISO 8601: when the editor sent it. */
  sentAt: string;
  /** The `Sndc` that went out, unchanged. */
  bytes: Uint8Array;
  /** The `SndA` the send named as the backup of the old state; `null`: it went out without one (decision 31). */
  backup: SendBackup | null;
}

/** What the UI reads: the last send of a slot without its bytes. */
export interface SentInfo { sentAt: string; backup: SendBackup | null }

/** What the restore is compared with: the bytes of the last send, or a `SndA` received after the backup. */
export type RestoreAgainst =
  | { kind: 'sent'; sentAt: string }
  | { kind: 'SndA'; dumpId: string; receivedAt: string };

/** `no backup`: there is no `SndA` to restore from. `cannot restore`: there is one, but the engine could not cut the slot out of it. */
export interface RestoreRefusal { kind: 'no backup' | 'cannot restore'; reason: string; whatToDo: string }

/**
 * `bytes`: the slot of the backup `SndA` as a `Sndc`, unchanged, ready for `connection.sendDump`. `changes`: what the
 * restore puts back against `against` (the UC4's state as far as the editor knows it); both `null` when the editor
 * has seen nothing since the backup (the state of the UC4 is not known).
 */
export type RestorePlan =
  | { ok: true; bytes: Uint8Array; backup: SendBackup; against: RestoreAgainst | null; changes: SendChanges | null }
  | { ok: false; refusal: RestoreRefusal };

/**
 * The backup of a restore: the `SndA` the last send of the slot named (the state before that send, whatever came
 * after); with no send recorded, the newest fresh `SndA`. A send without a backup, or whose backup is gone, has none:
 * a `SndA` received after it already holds the sent state.
 */
export function chooseBackup(
  dumps: readonly StoredDump[], last: LastSend | undefined, slot: number, connectedAt: number,
): { ok: true; backup: SendBackup } | { ok: false; refusal: RestoreRefusal } {
  const se = slotName(slot);
  const no = (reason: string, whatToDo: string) => ({ ok: false as const, refusal: { kind: 'no backup' as const, reason, whatToDo } });
  if (last) {
    if (!last.backup) return no(`${se} was sent without a backup, so the old ${se} cannot be restored.`, 'Press SndA on the UC4 before the next send.');
    const d = dumps.find((x) => x.id === last.backup!.dumpId);
    if (!d || d.type !== 'all' || d.unreadable) return no(`The backup of the last send of ${se} is no longer kept, so the old ${se} cannot be restored.`, 'Press SndA on the UC4 before the next send.');
    return { ok: true, backup: { dumpId: d.id, receivedAt: receivedAtOf(d) ?? last.backup.receivedAt } };
  }
  const fresh = freshBackup(dumps, connectedAt);
  return fresh ? { ok: true, backup: fresh } : no(`There is no backup of ${se} from this connection.`, `Press SndA on the UC4 first; ${se} is restored from it.`);
}

/** The SndAs received after the backup, newest first, and the last send, as the candidates for "what the UC4 holds now". */
export function newerStates(
  dumps: readonly StoredDump[], backup: SendBackup, last: LastSend | undefined,
): Array<{ at: string; against: RestoreAgainst; dump?: StoredDump }> {
  const out: Array<{ at: string; against: RestoreAgainst; dump?: StoredDump }> = [];
  for (const d of dumps) {
    const at = receivedAtOf(d);
    if (d.type !== 'all' || d.unreadable || d.id === backup.dumpId || at === undefined || !(at > backup.receivedAt)) continue;
    out.push({ at, against: { kind: 'SndA', dumpId: d.id, receivedAt: at }, dump: d });
  }
  if (last && last.sentAt > backup.receivedAt) out.push({ at: last.sentAt, against: { kind: 'sent', sentAt: last.sentAt } });
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
