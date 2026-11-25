// Plan a send (plan 0005 step 12, decisions 21–25): what the dialog shows before one `Sndc` goes to the UC4.
// Pure: the library builds the bytes (the one build path of `syxExport.ts`) and passes the kept dumps in;
// nothing here sends or changes anything. Step 14 (restore one setup from the backup) reuses `describeChanges`
// and `freshBackup` with bytes it builds from the backup `SndA`.
import type { Setup } from '../model/index.ts';
import { uc4Engine } from '../protocol/engine.ts';
import type { ByteDiff, FieldId, RawDump } from '../protocol/types.ts';
import { slotName } from './dumpImport.ts';
import type { StoredDump } from './storage.ts';
import { controlsOf, CONTROL_NAME, GROUP_KIND, propertyWord, type SyxRefusal } from './syxExport.ts';

const engine = uc4Engine;

/** Decision 24: the dialog lists at most this many changes, then a count of the rest. */
export const CHANGES_SHOWN = 8;

/** What the dialog says about the changes: `lines` (at most 8), `more` the number left out, `total` all of them. No change: `total` 0. */
export interface SendChanges {
  lines: string[];
  /** One per `lines` entry, same order: the text again, plus the values for a group-name change so the UI can spell them its way. */
  items: ChangeItem[];
  more: number;
  total: number;
}
/** `name` is set for an encoder group name change: `group` 1–8, `from` and `to` the 4-character names as stored. */
export interface ChangeItem { text: string; name?: { group: number; from: string; to: string } }

/** The newest kept `SndA` received from the device since the connection (decision 22). */
export interface SendBackup { dumpId: string; /** ISO 8601: when the editor received it. */ receivedAt: string }

/**
 * What the `Sndc` is built on, in this order (decisions 30, 31): the fresh `SndA`'s part for the slot (`dumpId`,
 * `receivedAt`), else the setup's linked `Sndc` (`dumpId`), else the factory setup of the slot. The changes are against it.
 */
export type SendBase =
  | { kind: 'SndA'; dumpId: string; receivedAt: string }
  | { kind: 'Sndc'; dumpId: string }
  | { kind: 'factory' };

/**
 * Why there is nothing to send. `cannot build`: not about the base (no slot, values the editor could not read), in the
 * export's words. `cannot send`: the engine refused the changes or the base (a SndA that cannot be cut), in words about sending.
 */
export type SendRefusal =
  | ({ kind: 'cannot build' } & SyxRefusal)
  | ({ kind: 'cannot send' } & SyxRefusal);

/** `backup`: the fresh `SndA` that holds the device's old state; `null` when there is none (decision 31). */
export type SendPlan =
  | { ok: true; bytes: Uint8Array; changes: SendChanges; base: SendBase; backup: SendBackup | null }
  | { ok: false; refusal: SendRefusal };

/** When the editor received this dump from the device; absent for a dump that was only imported from a file. */
export function receivedAtOf(d: StoredDump): string | undefined {
  return d.receivedAt ?? (d.source === 'received' ? d.date : undefined);
}

/** The newest readable `SndA` of 18 setups received at or after `connectedAt` (ms since the epoch); an imported file never counts. */
export function freshBackup(dumps: readonly StoredDump[], connectedAt: number): SendBackup | undefined {
  let best: SendBackup | undefined;
  for (const d of dumps) {
    if (d.type !== 'all' || d.unreadable) continue;
    const at = receivedAtOf(d);
    if (at === undefined || !(Date.parse(at) >= connectedAt)) continue;
    if (!best || at > best.receivedAt) best = { dumpId: d.id, receivedAt: at };
  }
  return best;
}

// --- the change list ---------------------------------------------------------------------------

const lowerFirst = (w: string): string => w.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase());
const shown = (v: unknown): string => (v === undefined || v === null || v === '' ? '–' : String(v));

function valueOf(setup: Setup, field: FieldId): unknown {
  if (field.what === 'groupName') return setup.encoderGroups[field.group - 1]?.name;
  const row = controlsOf(setup).find((r) => r.kind === field.control && r.group === field.group && r.index === field.index);
  return row?.control[field.property];
}

/** `Encoder group 1: name GrP1 → send`, `Enc1, encoder group 1: number 8 → 99`. */
function line(field: FieldId, before: Setup, after: Setup): string {
  if (field.what === 'groupName') return `Encoder group ${field.group}: name ${shown(valueOf(before, field))} → ${shown(valueOf(after, field))}`;
  const where = `${CONTROL_NAME[field.control]}${field.index}, ${GROUP_KIND[field.control]} ${field.group}`;
  return `${where}: ${lowerFirst(propertyWord(field.control, field.property))} ${shown(valueOf(before, field))} → ${shown(valueOf(after, field))}`;
}

/** The changes between two setups' dumps in the device's words. A change in bytes no field names counts as one line. */
export function describeChanges(diffs: readonly ByteDiff[], slot: number, before: Setup, after: Setup): SendChanges {
  const all: ChangeItem[] = [];
  const seen = new Set<string>();
  let unnamed = 0;
  for (const d of diffs) {
    if (d.slot !== null && d.slot !== slot) continue;
    if (!d.field) { unnamed += 1; continue; }
    const field = d.field;
    const text = line(field, before, after);
    // A name changes several bytes; a byte of two nibble fields gives two entries: one line per field.
    if (seen.has(text)) continue;
    seen.add(text);
    all.push(field.what === 'groupName'
      ? { text, name: { group: field.group, from: String(valueOf(before, field) ?? ''), to: String(valueOf(after, field) ?? '') } }
      : { text });
  }
  if (unnamed > 0) all.push({ text: `${unnamed} byte${unnamed === 1 ? '' : 's'} the editor does not name in ${slotName(slot)}` });
  const items = all.slice(0, CHANGES_SHOWN);
  return { lines: items.map((i) => i.text), items, more: Math.max(0, all.length - CHANGES_SHOWN), total: all.length };
}

/** Diff of the built dump against its base, as the dialog's list. `undefined` when either cannot be read (the build read it back already, so that is a bug to report). */
export function changesBetween(base: RawDump, built: Uint8Array, slot: number, now: () => string): SendChanges | undefined {
  const a = engine.parse(base.bytes, base.source, now);
  const b = engine.parse(built, { kind: 'generated' }, now);
  if (!a.ok || !b.ok || a.messages.length !== 1 || b.messages.length !== 1) return undefined;
  const da = engine.decode(a.messages[0]!), db = engine.decode(b.messages[0]!);
  if (!da.ok || !db.ok) return undefined;
  const sa = da.setups.find((s) => s.slot === slot), sb = db.setups.find((s) => s.slot === slot);
  if (!sa || !sb) return undefined;
  return describeChanges(engine.diff(a.messages[0]!, b.messages[0]!), slot, sa.setup, sb.setup);
}
