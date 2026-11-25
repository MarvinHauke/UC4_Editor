// Reading a SysEx dump into a configuration (plan 0005 step 1). Pure: the protocol engine does the
// bytes, this file turns its answer into what the library's import commands work with. A dump never
// reaches the configuration except through `decode`; values it cannot read become problems.
import { FORMAT, SCHEMA_VERSION, factorySetup } from '../model/index.ts';
import type { Problem, Uc4Config } from '../model/index.ts';
import { uc4Engine } from '../protocol/engine.ts';
import type { FieldId, SlotField } from '../protocol/types.ts';

// The one place that names the device: a second Faderfox device changes these two lines.
const engine = uc4Engine;
const PROFILE_ID: Uc4Config['device']['profile'] = 'faderfox-uc4'; // must equal faderfoxUc4.id (tested)

export const UNREADABLE_TEXT = 'unreadable in the dump, factory value shown';
export const IMPORT_READS = 'Import reads .json files or a .syx dump from the UC4.';

export type DumpRead =
  | { status: 'refused'; reason: string; whatToDo: string }
  | { status: 'read'; configuration: Uc4Config; problems: Problem[]; warnings: string[]; type: 'all' | 'one'; slots: number[]; firmware: string };

/** The device's name for a setup that has no other: its slot (`SE16`). */
export const slotName = (slot: number): string => `SE${String(slot).padStart(2, '0')}`;

/** Does this file look like a SysEx dump (starts with F0)? Everything else is read as text. A file that starts with F0 and that the engine refuses is refused as a dump; it does not fall back to JSON. */
export const looksLikeDump = (bytes: Uint8Array): boolean => bytes.length > 0 && bytes[0] === 0xf0;

/** The model path of a field, in the setup at `setupIndex`. Groups and indexes are 1-based in a `FieldId`. */
export function fieldPath(setupIndex: number, field: FieldId): string {
  const base = `setups[${setupIndex}]`;
  if (field.what === 'groupName') return `${base}.encoderGroups[${field.group - 1}].name`;
  const list = { encoder: 'encoderGroups', pushButton: 'encoderGroups', greenButton: 'faderButtonGroups', fader: 'faderButtonGroups' }[field.control];
  const items = { encoder: 'encoders', pushButton: 'pushButtons', greenButton: 'buttons', fader: 'faders' }[field.control];
  return `${base}.${list}[${field.group - 1}].${items}[${field.index - 1}].${field.property}`;
}

export function readDump(bytes: Uint8Array, now: Date): DumpRead {
  const parsed = engine.parse(bytes, { kind: 'file', name: 'import.syx' }, () => now.toISOString());
  if (!parsed.ok) return { status: 'refused', reason: parsed.reason.message, whatToDo: parsed.reason.whatToDo };
  const bad = parsed.skipped[0];
  if (bad) {
    return { status: 'refused', reason: `Part of the file is damaged: ${bad.reason.message}`, whatToDo: bad.reason.whatToDo };
  }
  const bySlot = new Map<number, { setup: Uc4Config['setups'][number]; unreadable: SlotField[] }>();
  const warnings: string[] = [];
  for (const message of parsed.messages) {
    const d = engine.decode(message, { makeId: (slot) => factorySetup(slot).id });
    if (!d.ok) return { status: 'refused', reason: d.reason.message, whatToDo: d.reason.whatToDo };
    for (const w of d.warnings) if (!warnings.includes(w.message)) warnings.push(w.message);
    for (const s of d.setups) bySlot.set(s.slot, { setup: s.setup, unreadable: s.unreadable });
  }
  const slots = [...bySlot.keys()].sort((a, b) => a - b);
  if (slots.length !== 1 && slots.length !== 18) {
    return {
      status: 'refused',
      reason: `The dump holds ${slots.length} setups (${slots.join(', ')}).`,
      whatToDo: 'Import takes one setup (a Sndc) or all 18 (a SndA). Save the dump again on the UC4.',
    };
  }
  const problems: Problem[] = [];
  slots.forEach((slot, i) => {
    for (const u of bySlot.get(slot)!.unreadable) problems.push({ path: fieldPath(i, u.field), message: UNREADABLE_TEXT });
  });
  const stamp = now.toISOString();
  const configuration: Uc4Config = {
    format: FORMAT, schemaVersion: SCHEMA_VERSION, device: { profile: PROFILE_ID },
    createdAt: stamp, updatedAt: stamp,
    setups: slots.map((s) => bySlot.get(s)!.setup),
  };
  return { status: 'read', configuration, problems, warnings, type: parsed.messages[0]!.type, slots, firmware: parsed.messages[0]!.firmware };
}

/** What a dump holds, in words: `SE16`, or `all 18 setups`. */
export const describeSlots = (slots: number[]): string =>
  slots.length === 1 ? slotName(slots[0]!) : slots.length === 18 ? 'all 18 setups' : `${slots.length} setups`;
