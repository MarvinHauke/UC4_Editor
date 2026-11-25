// `.syx` export (plan 0007 step 3.2): turns setups into the bytes of a Sndc or SndA through the protocol
// engine, says in the device's words why it refused, and reads the result back before it is offered
// (decision 14). Pure: no state, no storage; the library chooses the base and the source.
import type { Setup } from '../model/index.ts';
import { uc4Engine } from '../protocol/engine.ts';
import type { FieldId, MessageType, RawDump, SlotField } from '../protocol/types.ts';
import { slotName } from './dumpImport.ts';

const engine = uc4Engine;

/** Why there is no file, in words for the dialog; `fields` is the full list the message may shorten. */
export interface SyxRefusal { reason: string; fields: string[]; whatToDo: string }
export type SyxBuild = { ok: true; bytes: Uint8Array } | { ok: false; refusal: SyxRefusal };

export interface SyxSetup { slot: number; setup: Setup; source?: RawDump }

export const JSON_INSTEAD = 'Export as JSON instead.';
/** The same, to follow "or". */
export const JSON_OR = 'export as JSON instead.';

// --- the device's words -----------------------------------------------------------------------

export const CONTROL_NAME = { encoder: 'Enc', pushButton: 'Pbt', greenButton: 'btn', fader: 'FAd' } as const;
export const GROUP_KIND = { encoder: 'encoder group', pushButton: 'encoder group', greenButton: 'fader/button group', fader: 'fader/button group' } as const;
export type Kind = keyof typeof CONTROL_NAME;
export type Prop = 'display' | 'type' | 'mode' | 'channel' | 'number' | 'lower' | 'upper';

/** The property's name as the property panel shows it. */
export function propertyWord(kind: Kind, p: Prop): string {
  switch (p) {
    case 'display': return kind === 'greenButton' ? 'LED' : 'Display scale';
    case 'type': return 'Command type';
    case 'mode': return kind === 'encoder' ? 'Acceleration' : kind === 'fader' ? 'Fader mode' : 'Button mode';
    case 'channel': return 'MIDI channel';
    case 'number': return 'Number';
    case 'lower': return 'Lower value';
    case 'upper': return 'Upper value';
  }
}

/** `Enc3 of encoder group 2: Command type`, `name of encoder group 1, character 2`. */
export function describeField(field: FieldId): string {
  if (field.what === 'groupName') return `name of encoder group ${field.group}, character ${field.char}`;
  return `${CONTROL_NAME[field.control]}${field.index} of ${GROUP_KIND[field.control]} ${field.group}: ${propertyWord(field.control, field.property)}`;
}

const describeSlotField = (f: SlotField, withSlot: boolean): string => (withSlot ? `${slotName(f.slot)} ${describeField(f.field)}` : describeField(f.field));

const SHOWN = 8;
function listed(fields: string[]): string {
  const shown = fields.slice(0, SHOWN).join('; ');
  return fields.length > SHOWN ? `${shown}; and ${fields.length - SHOWN} more` : shown;
}

// --- read back (decision 14) ------------------------------------------------------------------

export type Rows = Array<{ kind: Kind; group: number; index: number; control: Record<string, unknown> }>;
const PROPS: Prop[] = ['display', 'type', 'mode', 'channel', 'number', 'lower', 'upper'];

export function controlsOf(s: Setup): Rows {
  const rows: Rows = [];
  s.encoderGroups.forEach((g, gi) => {
    g.encoders.forEach((c, i) => rows.push({ kind: 'encoder', group: gi + 1, index: i + 1, control: c as unknown as Record<string, unknown> }));
    g.pushButtons.forEach((c, i) => rows.push({ kind: 'pushButton', group: gi + 1, index: i + 1, control: c as unknown as Record<string, unknown> }));
  });
  s.faderButtonGroups.forEach((g, gi) => {
    g.buttons.forEach((c, i) => rows.push({ kind: 'greenButton', group: gi + 1, index: i + 1, control: c as unknown as Record<string, unknown> }));
    g.faders.forEach((c, i) => rows.push({ kind: 'fader', group: gi + 1, index: i + 1, control: c as unknown as Record<string, unknown> }));
  });
  return rows;
}

/** What differs between the setup and what the file holds, in the device's words. Editor-only things (names, labels, id) are not compared. */
export function differences(wanted: Setup, got: Setup): string[] {
  const out: string[] = [];
  const a = controlsOf(wanted), b = controlsOf(got);
  a.forEach((row, i) => {
    const other = b[i]?.control ?? {};
    for (const p of PROPS) {
      if (JSON.stringify(row.control[p]) !== JSON.stringify(other[p])) out.push(describeField({ what: 'control', control: row.kind, group: row.group, index: row.index, property: p }));
    }
  });
  wanted.encoderGroups.forEach((g, gi) => {
    if (g.name !== got.encoderGroups[gi]?.name) out.push(`name of encoder group ${gi + 1}`);
  });
  return out;
}

// --- build ------------------------------------------------------------------------------------

const refusalOf = (reason: string, whatToDo: string, fields: string[] = []): SyxBuild => ({ ok: false, refusal: { reason, fields, whatToDo } });

/**
 * Encodes the setups into one message, then parses and decodes the bytes again and compares them with the
 * setups. No bytes come out unless both agree. `base`: the dump to patch (a Sndc needs one; a SndA starts
 * from the factory image without it).
 */
export function buildSyx(message: MessageType, setups: SyxSetup[], base: RawDump | undefined, now: () => string, words: 'export' | 'send' = 'export'): SyxBuild {
  const many = message === 'all';
  // What to do next: the export offers JSON; a send speaks of sending (plan 0005 decision 30).
  const way = words === 'send' ? { or: 'then send again.', instead: '' } : { or: JSON_OR, instead: ` ${JSON_INSTEAD}` };
  const refusal = (reason: string, whatToDo: string, fields: string[] = []): SyxBuild => refusalOf(reason, whatToDo.trim(), fields);
  const r = engine.encode({ setups, message, ...(base ? { base } : {}) }, now);
  if (!r.ok) {
    const { code, message: text, whatToDo } = r.reason;
    const fields = r.blocked.map((f) => describeSlotField(f, many));
    switch (code) {
      case 'unconfirmed-fields':
        return refusal(`${many ? 'The setups' : slotName(setups[0]!.slot)} hold${many ? '' : 's'} changes the editor cannot write to the UC4 yet: ${listed(fields)}.`,
          `Undo these changes, ${words === 'send' ? way.or : `or ${way.or}`}`, fields);
      case 'invalid-setup':
        return refusal(fields.length > 0 ? `${fields.length} value${fields.length === 1 ? '' : 's'} cannot be stored on the UC4: ${listed(fields)}.` : text,
          fields.length > 0 ? `Correct them, ${words === 'send' ? way.or : `or ${way.or}`}` : `${whatToDo}${way.instead}`, fields);
      case 'no-base':
        if (!many) {
          const slot = slotName(setups[0]!.slot);
          return refusal(`${slot} cannot be written as a single setup (Sndc) yet: that needs a Sndc of ${slot} kept from the UC4, and there is none for this setup.`,
            `Send ${slot} from the UC4 once (Sndc: setup mode, encoder 4), then export again. Export all setups as .syx, or ${JSON_OR}`);
        }
        return refusal(text, `${whatToDo}${way.instead}`);
      default:
        return refusal(text, `${whatToDo}${way.instead}`);
    }
  }

  const back = engine.parse(r.raw.bytes, { kind: 'generated' }, now);
  const msg = back.ok && back.messages.length === 1 && back.skipped.length === 0 ? back.messages[0]! : undefined;
  const dec = msg ? engine.decode(msg, { makeId: (slot) => `slot-${slot}` }) : undefined;
  if (!msg || !dec || !dec.ok) {
    return refusal('The generated file could not be read back, so it is not offered.', `Report this.${way.instead}`);
  }
  const wrong: string[] = [];
  for (const { slot, setup } of setups) {
    const got = dec.setups.find((d) => d.slot === slot);
    if (!got) { wrong.push(`${slotName(slot)} is missing`); continue; }
    for (const d of differences(setup, got.setup)) wrong.push(many ? `${slotName(slot)} ${d}` : d);
  }
  if (dec.setups.length !== setups.length) wrong.push(`the file holds ${dec.setups.length} setup${dec.setups.length === 1 ? '' : 's'}, not ${setups.length}`);
  if (wrong.length > 0) {
    return refusal(`The generated file does not hold what you edited (${listed(wrong)}), so it is not offered.`, `Report this.${way.instead}`, wrong);
  }
  return { ok: true, bytes: r.raw.bytes };
}
