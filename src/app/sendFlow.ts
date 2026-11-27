// The words and logic of the Send dialog (plan 0005 step 13, decisions 23–25 and 28). Plain functions, tested as data.
// The UI never reads the bytes: it passes `plan.bytes` to `sendDump`, and compares a later `Sndc` with what went out.
import type { RestorePlan, SendBase, SendPlan } from '../storage/index.ts';
import { formatExported, slotName } from './format.ts';
import { spellChange } from './profile/uc4Display.ts';

/** What the dialog shows for a plan: the question, or a refusal it cannot get past. */
export type SendView =
  | { kind: 'confirm'; title: string; replaces: string; changesTitle: string | null; changes: string[]; moreLine: string | null; noChanges: string | null; backup: { has: boolean; text: string } }
  | { kind: 'refused'; title: string; reason: string; whatToDo: string; fields: string[] };

/** "01:41", in local time. */
export function clockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '?';
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const sendTitle = (slot: number, name: string, device: string): string => `Send ${slotName(slot)} "${name}" to the ${device}?`;

/** Decision 31: what the change list compares against, in words. `dateOf` gives the date of a kept dump, formatted. */
function baseWords(base: SendBase, slot: number, dateOf: (dumpId: string) => string, device: string): { title: string; none: string } {
  if (base.kind === 'SndA') return { title: `Changes on the ${device} (backup SndA of ${clockTime(base.receivedAt)})`, none: `No changes: ${slotName(slot)} is the same as on the ${device}.` };
  if (base.kind === 'Sndc') return { title: `Changes since the setup's Sndc${dateOf(base.dumpId) ? ` of ${dateOf(base.dumpId)}` : ''}`, none: `No changes since that Sndc. The ${device} may still differ.` };
  return { title: 'Changes from the factory setup', none: `No changes from the factory setup. The ${device} may still differ.` };
}

/** Decisions 23–25, 30, 31: the question, the changes and what they compare against, what the backup is for. */
export function sendView(plan: SendPlan, slot: number, name: string, device: string, dateOf: (dumpId: string) => string): SendView {
  if (!plan.ok) {
    const r = plan.refusal;
    return { kind: 'refused', title: `${slotName(slot)} "${name}" cannot be sent`, reason: r.reason, whatToDo: r.whatToDo, fields: r.fields };
  }
  const { items, more, total } = plan.changes;
  const words = baseWords(plan.base, slot, dateOf, device);
  return {
    kind: 'confirm', title: sendTitle(slot, name, device), replaces: `It replaces ${slotName(slot)} on the device.`,
    changesTitle: words.title, changes: items.map(spellChange), moreLine: more > 0 ? `+ ${more} more` : null, noChanges: total === 0 ? words.none : null,
    backup: plan.backup
      ? { has: true, text: `A send can't be undone in the editor. Your backup from ${clockTime(plan.backup.receivedAt)} holds the old state.` }
      : { has: false, text: `No backup from the ${device}: the old ${slotName(slot)} can't be restored. Press SndA first if you want one.` },
  };
}

/** Decision 28: after Send, one line; the editor never sees the UC4's `Err`. */
export const sentLine = (slot: number, device: string): string =>
  `Sent ${slotName(slot)}. The ${device} shows ${slotName(slot)} when it's stored. If it shows Err, ${slotName(slot)} may be half written: send again.`;

/** A failed send: the message, and that nothing went out (the "not sent" is not repeated when the message says it). */
export const failedLine = (message: string): string => (/nothing was sent/i.test(message) ? message : `${message} Nothing was sent.`);

export const matchLine = (slot: number, device: string): string => `${slotName(slot)} on the ${device} matches the editor`;

/** Byte for byte: a `Sndc` the UC4 sends back is the sent one only if every byte is the same. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** "01:41" for today, else "2026-11-17 01:41": a backup kept across a reload can be from another day. */
export function whenOf(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.toDateString() === now.toDateString() ? clockTime(iso) : formatExported(iso);
}

/** Decision 28 (step 14): the Restore dialog, built from the library's `planRestore`. `dateOf` formats an ISO time. */
export function restoreView(plan: RestorePlan, slot: number, name: string, device: string, dateOf: (iso: string) => string): SendView {
  if (!plan.ok) {
    const r = plan.refusal;
    return { kind: 'refused', title: `${slotName(slot)} "${name}" cannot be restored`, reason: r.reason, whatToDo: r.whatToDo, fields: [] };
  }
  const at = whenOf(plan.backup.receivedAt);
  const base = { kind: 'confirm' as const, title: `Restore ${slotName(slot)} from the backup SndA of ${at}?`,
    replaces: `It replaces ${slotName(slot)} on the ${device} with the backup; the editor's ${slotName(slot)} stays as it is.`, backup: { has: true, text: '' } };
  if (!plan.changes || !plan.against) return { ...base, changesTitle: null, changes: [], moreLine: null, noChanges: `The ${device}'s current state is unknown, so the changes cannot be listed.` };
  const { items, more, total } = plan.changes;
  const title = plan.against.kind === 'sent' ? `Changes against what was sent on ${dateOf(plan.against.sentAt)}` : `Changes on the ${device} (SndA of ${whenOf(plan.against.receivedAt)})`;
  return { ...base, changesTitle: title, changes: items.map(spellChange), moreLine: more > 0 ? `+ ${more} more` : null, noChanges: total === 0 ? `No changes: ${slotName(slot)} on the ${device} is the same as the backup.` : null };
}

export const restoredLine = (slot: number, device: string): string =>
  `Restored ${slotName(slot)} from the backup. The ${device} shows ${slotName(slot)} when it's stored. If it shows Err, ${slotName(slot)} may be half written: restore again.`;
export const restoreMatchLine = (slot: number, device: string): string => `${slotName(slot)} on the ${device} matches the backup`;

/** Decision 30: the check line above the steps. Open warnings are listed by the dialog; with none open it says what was checked. */
export function sendCheck(open: number, ignored: number): { clear: boolean; text: string } {
  if (open > 0) return { clear: false, text: `${open} warning${open === 1 ? '' : 's'} in this setup` };
  return { clear: true, text: ignored > 0 ? `No open warnings · ${ignored} ignored` : 'No open warnings' };
}
