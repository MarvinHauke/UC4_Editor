// Image ⇄ model Setup, driven by the profile's tables (plan 0004 step 2: the reading half). Pure, never throws.
// What each byte means and how sure we are lives in the profile; this file only applies the tables.
import { factorySetup } from '../model/factory.ts';
import type { Encoder, EncoderGroup, Fader, FaderButtonGroup, GreenButton, PushButton, Setup } from '../model/types.ts';
import { IMAGE_SIZE, type MemoryImage } from './image.ts';
import type { DeviceProfile, FieldSpec, PositionConfidence } from './profile.ts';
import type { ByteRange, Capabilities, Confidence, ControlKind, FieldId, Property, SlotField } from './types.ts';

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

function regionBase(profile: DeviceProfile, name: string, slot: number): number {
  const r = profile.layout.regions.find((x) => x.name === name);
  if (!r) throw new Error(`profile has no region ${name}`); // a broken profile is a programming error, not a user action
  return r.base + r.stride * (slot - 1);
}

/** Address of the byte holding a control's field. Fader 9 (`index` 9 of `fader`) is in its own table. */
export function controlByteAddress(profile: DeviceProfile, slot: number, control: ControlKind, group: number, index: number, spec: FieldSpec): number {
  const l = profile.layout;
  if (control === 'fader' && index === l.controls.fader.perGroup + 1)
    return regionBase(profile, 'fader9', slot) + l.fader9.recordSize * (group - 1) + spec.field;
  return regionBase(profile, 'block', slot) + (l.controls[control].firstField + spec.field) * l.fieldSize + l.controls[control].perGroup * (group - 1) + (index - 1);
}

export function nameByteAddress(profile: DeviceProfile, slot: number, group: number, char: number): number {
  return regionBase(profile, 'groupNames', slot) + profile.layout.names.chars * (group - 1) + (char - 1);
}

/** First = group 1 control 1, last = the last group's last control, else between. Fader 9 passes its own groups × 1. */
function positionConfidence(c: PositionConfidence, groups: number, perGroup: number, group: number, index: number): 'confirmed' | 'likely' | 'unknown' {
  if (group === 1 && index === 1) return c.first;
  if (group === groups && index === perGroup) return c.last;
  return c.between;
}

/** The nibble or byte a spec reads out of a byte (a plain value above 127 is rejected by `readValue`). */
function raw(spec: FieldSpec, b: number): number {
  return spec.nibble === 'high' ? b >> 4 : spec.nibble === 'low' ? b & 0x0f : b;
}

type Value = string | number;

/** Reads one property; `undefined` = the byte is outside the table. */
function readValue(spec: FieldSpec, b: number): Value | undefined {
  const v = raw(spec, b);
  if (spec.codes) return spec.codes.find((c) => c.code === v)?.name;
  if (spec.property === 'channel') return v + 1;
  return v <= 127 ? v : undefined;
}

type ControlObject = Record<string, Value>;

function readControl(profile: DeviceProfile, image: MemoryImage, slot: number, control: ControlKind, group: number, index: number,
  specs: readonly FieldSpec[], fallback: ControlObject, unreadable: SlotField[]): ControlObject {
  const out: ControlObject = {};
  for (const spec of specs) {
    const v = readValue(spec, image.bytes[controlByteAddress(profile, slot, control, group, index, spec)]!);
    if (v === undefined) {
      unreadable.push({ slot, field: { what: 'control', control, group, index, property: spec.property } as FieldId });
      out[spec.property] = fallback[spec.property]!;
    } else out[spec.property] = v;
  }
  return out;
}

/** Name of a slot as the device shows it: `SE16`. */
export const slotName = (slot: number): string => `SE${String(slot).padStart(2, '0')}`;

/** Decodes one slot of an image into a model Setup. Fields outside the code tables take the factory value and are listed. */
export function decodeSlot(profile: DeviceProfile, image: MemoryImage, slot: number, id: string): { setup: Setup; unreadable: SlotField[] } {
  const l = profile.layout;
  const factory = factorySetup(slot);
  const unreadable: SlotField[] = [];
  const specsOf = (control: ControlKind): FieldSpec[] => profile.fields.filter((f) => f.control === control);
  const encSpecs = specsOf('encoder'), pushSpecs = specsOf('pushButton'), greenSpecs = specsOf('greenButton'), faderSpecs = specsOf('fader');

  const encoderGroups: EncoderGroup[] = range(l.controls.encoder.groups).map((g) => {
    const name = range(l.names.chars).map((c) => {
      const code = image.bytes[nameByteAddress(profile, slot, g + 1, c + 1)]!;
      const ch = profile.nameCodes[code]?.char;
      if (ch === undefined) {
        unreadable.push({ slot, field: { what: 'groupName', group: g + 1, char: c + 1 } });
        return [...factory.encoderGroups[g]!.name][c]!;
      }
      return ch;
    }).join('');
    const fg = factory.encoderGroups[g]!;
    return {
      name,
      encoders: range(l.controls.encoder.perGroup).map((i) => readControl(profile, image, slot, 'encoder', g + 1, i + 1, encSpecs, fg.encoders[i] as unknown as ControlObject, unreadable) as unknown as Encoder),
      pushButtons: range(l.controls.pushButton.perGroup).map((i) => readControl(profile, image, slot, 'pushButton', g + 1, i + 1, pushSpecs, fg.pushButtons[i] as unknown as ControlObject, unreadable) as unknown as PushButton),
    };
  });
  const faderButtonGroups: FaderButtonGroup[] = range(l.controls.fader.groups).map((g) => {
    const fg = factory.faderButtonGroups[g]!;
    const faders = range(l.controls.fader.perGroup).map((i) => readControl(profile, image, slot, 'fader', g + 1, i + 1, faderSpecs, fg.faders[i] as unknown as ControlObject, unreadable) as unknown as Fader);
    faders.push(readControl(profile, image, slot, 'fader', g + 1, l.controls.fader.perGroup + 1, profile.fader9Fields, fg.faders[l.controls.fader.perGroup] as unknown as ControlObject, unreadable) as unknown as Fader);
    return {
      faders,
      buttons: range(l.controls.greenButton.perGroup).map((i) => readControl(profile, image, slot, 'greenButton', g + 1, i + 1, greenSpecs, fg.buttons[i] as unknown as ControlObject, unreadable) as unknown as GreenButton),
    };
  });
  return { setup: { id, name: slotName(slot), slot, encoderGroups, faderButtonGroups }, unreadable };
}

/**
 * Bytes of the image that no `confirmed` field covers, as ascending contiguous ranges. A byte counts as confirmed
 * only when every nibble of it has a spec that is confirmed at that control's position; a group-name byte when its
 * position is confirmed (the code is per value, see `capabilities`). Only bytes the image covers are reported.
 */
export function unknownRegions(profile: DeviceProfile, image: MemoryImage, slots: readonly number[]): ByteRange[] {
  const confirmed = new Uint8Array(IMAGE_SIZE);
  const l = profile.layout;
  const mark = (control: ControlKind, slot: number, specs: readonly FieldSpec[], groups: number, perGroup: number, fader9: boolean): void => {
    // per (field byte, position): the byte is confirmed when all its nibbles are
    const fields = [...new Set(specs.map((s) => s.field))];
    for (const field of fields) {
      const own = specs.filter((s) => s.field === field);
      const whole = own.some((s) => s.nibble === 'byte') || (own.some((s) => s.nibble === 'high') && own.some((s) => s.nibble === 'low'));
      if (!whole) continue;
      for (let g = 1; g <= groups; g++)
        for (let i = 1; i <= perGroup; i++) {
          if (!own.every((s) => positionConfidence(s.confidence, groups, perGroup, g, i) === 'confirmed')) continue;
          confirmed[controlByteAddress(profile, slot, control, g, fader9 ? l.controls.fader.perGroup + 1 : i, own[0]!)] = 1;
        }
    }
  };
  for (const slot of slots) {
    for (const control of Object.keys(l.controls) as ControlKind[])
      mark(control, slot, profile.fields.filter((f) => f.control === control), l.controls[control].groups, l.controls[control].perGroup, false);
    mark('fader', slot, profile.fader9Fields, l.fader9.groups, 1, true);
    for (const [g, c] of profile.confirmedNamePositions) confirmed[nameByteAddress(profile, slot, g, c)] = 1;
  }
  const out: ByteRange[] = [];
  for (let a = 0; a < IMAGE_SIZE; a++) {
    if (!image.covered[a] || confirmed[a]) continue;
    const last = out[out.length - 1];
    if (last && last.address + last.length === a) last.length++;
    else out.push({ address: a, length: 1 });
  }
  return out;
}

// ---- encode: the writing half ---------------------------------------------------------------------------------------

/** One byte (or nibble) to change in the image: `mask` selects the bits, `value` is already shifted into place. */
export interface BytePatch { address: number; mask: number; value: number }

export interface SlotEncoding {
  patches: BytePatch[];
  /** Changed fields that will be written. */
  written: SlotField[];
  /** Changed fields that are not `confirmed` (position, code or name character). */
  blocked: SlotField[];
  /** Fields whose value cannot be written at all (wrong type, out of range, not in the code table). */
  invalid: SlotField[];
}

const shiftOf = (n: FieldSpec['nibble']): number => (n === 'high' ? 4 : 0);
const maskOf = (n: FieldSpec['nibble']): number => (n === 'byte' ? 0xff : 0x0f << shiftOf(n));

/** The value a request holds for a control property, `undefined` when the path does not exist. */
function requestControl(setup: Setup, control: ControlKind, group: number, index: number): Record<string, unknown> | undefined {
  const g = control === 'encoder' || control === 'pushButton' ? setup.encoderGroups?.[group - 1] : setup.faderButtonGroups?.[group - 1];
  if (!g) return undefined;
  const list = control === 'encoder' ? (g as EncoderGroup).encoders
    : control === 'pushButton' ? (g as EncoderGroup).pushButtons
    : control === 'greenButton' ? (g as FaderButtonGroup).buttons
    : (g as FaderButtonGroup).faders;
  return list?.[index - 1] as unknown as Record<string, unknown> | undefined;
}

/** The raw nibble/byte value to write for `value`, or `undefined` if it cannot be written. */
function encodeValue(spec: FieldSpec, value: unknown): { raw: number; codeConfidence: 'confirmed' | 'likely' | 'unknown' } | undefined {
  if (spec.codes) {
    const c = spec.codes.find((x) => x.name === value);
    return c ? { raw: c.code, codeConfidence: c.confidence } : undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined;
  if (spec.property === 'channel') return value >= 1 && value <= 16 ? { raw: value - 1, codeConfidence: 'confirmed' } : undefined;
  return value >= 0 && value <= 127 ? { raw: value, codeConfidence: 'confirmed' } : undefined;
}

/**
 * Compares a setup with what the base holds in a slot, field by field, and returns the byte patches for the changed
 * fields. Equal fields produce nothing (the base bytes stay, including bytes the model cannot hold). A changed field
 * is written only when its position and its code are `confirmed`; otherwise it is listed in `blocked`.
 */
export function encodeSlot(profile: DeviceProfile, image: MemoryImage, slot: number, setup: Setup): SlotEncoding {
  const l = profile.layout;
  const out: SlotEncoding = { patches: [], written: [], blocked: [], invalid: [] };
  const base = decodeSlot(profile, image, slot, 'base').setup;
  const specsOf = (control: ControlKind): FieldSpec[] => profile.fields.filter((f) => f.control === control);

  const control = (kind: ControlKind, group: number, index: number, specs: readonly FieldSpec[], baseObj: Record<string, unknown>, groups: number, perGroup: number, fader9: boolean): void => {
    const req = requestControl(setup, kind, group, index);
    for (const spec of specs) {
      const id: FieldId = { what: 'control', control: kind, group, index, property: spec.property };
      const sf: SlotField = { slot, field: id };
      if (!req) { out.invalid.push(sf); continue; }
      const want = req[spec.property];
      if (want === baseObj[spec.property]) continue;
      const enc = encodeValue(spec, want);
      if (!enc) { out.invalid.push(sf); continue; }
      const pos = positionConfidence(spec.confidence, groups, fader9 ? 1 : perGroup, group, fader9 ? 1 : index);
      if (pos !== 'confirmed' || enc.codeConfidence !== 'confirmed') { out.blocked.push(sf); continue; }
      out.patches.push({ address: controlByteAddress(profile, slot, kind, group, index, spec), mask: maskOf(spec.nibble), value: enc.raw << shiftOf(spec.nibble) });
      out.written.push(sf);
    }
  };

  for (const kind of Object.keys(l.controls) as ControlKind[]) {
    const { groups, perGroup } = l.controls[kind];
    const baseOf = (g: number, i: number): Record<string, unknown> => requestControl(base, kind, g, i) as unknown as Record<string, unknown>;
    for (let g = 1; g <= groups; g++)
      for (let i = 1; i <= perGroup; i++) control(kind, g, i, specsOf(kind), baseOf(g, i), groups, perGroup, false);
  }
  for (let g = 1; g <= l.fader9.groups; g++)
    control('fader', g, l.controls.fader.perGroup + 1, profile.fader9Fields, requestControl(base, 'fader', g, l.controls.fader.perGroup + 1) as unknown as Record<string, unknown>, l.fader9.groups, 1, true);

  for (let g = 1; g <= l.names.groups; g++) {
    const reqName = setup.encoderGroups?.[g - 1]?.name;
    const baseName = [...base.encoderGroups[g - 1]!.name];
    const chars = typeof reqName === 'string' ? [...reqName] : undefined;
    for (let c = 1; c <= l.names.chars; c++) {
      const sf: SlotField = { slot, field: { what: 'groupName', group: g, char: c } };
      if (!chars || chars.length !== l.names.chars) { out.invalid.push(sf); continue; }
      if (chars[c - 1] === baseName[c - 1]) continue;
      const code = profile.nameCodes.find((n) => n.char === chars[c - 1]);
      if (!code) { out.invalid.push(sf); continue; }
      const posOk = profile.confirmedNamePositions.some(([pg, pc]) => pg === g && pc === c);
      if (!posOk || code.confidence !== 'confirmed') { out.blocked.push(sf); continue; }
      out.patches.push({ address: nameByteAddress(profile, slot, g, c), mask: 0xff, value: code.code });
      out.written.push(sf);
    }
  }
  return out;
}

// ---- diff: which field a byte belongs to ----------------------------------------------------------------------------

/** What a byte of the image holds: its setup and, per nibble or byte, the field and its spec. */
export interface ByteOwner { slot: number; fields: Array<{ id: FieldId; spec?: FieldSpec; position: 'confirmed' | 'likely' | 'unknown' }> }

/** The setup and fields an address belongs to; `null` outside the three per-setup regions. A group-name byte has no spec. */
export function ownerOf(profile: DeviceProfile, address: number): ByteOwner | null {
  const l = profile.layout;
  const inRegion = (name: string): { slot: number; off: number } | null => {
    const r = l.regions.find((x) => x.name === name)!;
    const o = address - r.base;
    if (o < 0 || o >= r.stride * l.slotCount || o % r.stride >= r.size) return null;
    return { slot: Math.floor(o / r.stride) + 1, off: o % r.stride };
  };
  const names = inRegion('groupNames');
  if (names) {
    if (names.off >= l.names.groups * l.names.chars) return { slot: names.slot, fields: [] };
    const group = Math.floor(names.off / l.names.chars) + 1, char = (names.off % l.names.chars) + 1;
    const ok = profile.confirmedNamePositions.some(([g, c]) => g === group && c === char);
    return { slot: names.slot, fields: [{ id: { what: 'groupName', group, char }, position: ok ? 'confirmed' : 'likely' }] };
  }
  const f9 = inRegion('fader9');
  if (f9) {
    if (f9.off >= l.fader9.groups * l.fader9.recordSize) return { slot: f9.slot, fields: [] };
    const group = Math.floor(f9.off / l.fader9.recordSize) + 1, byte = f9.off % l.fader9.recordSize;
    return { slot: f9.slot, fields: profile.fader9Fields.filter((s) => s.field === byte).map((spec) => ({
      id: { what: 'control', control: 'fader', group, index: l.controls.fader.perGroup + 1, property: spec.property } as FieldId,
      spec, position: positionConfidence(spec.confidence, l.fader9.groups, 1, group, 1),
    })) };
  }
  const blk = inRegion('block');
  if (blk) {
    const field = Math.floor(blk.off / l.fieldSize), k = blk.off % l.fieldSize;
    const kind = (Object.keys(l.controls) as ControlKind[]).find((c) => field >= l.controls[c].firstField && field < l.controls[c].firstField + 5);
    if (!kind) return { slot: blk.slot, fields: [] };
    const { perGroup, groups } = l.controls[kind];
    if (k >= groups * perGroup) return { slot: blk.slot, fields: [] };
    const group = Math.floor(k / perGroup) + 1, index = (k % perGroup) + 1, within = field - l.controls[kind].firstField;
    return { slot: blk.slot, fields: profile.fields.filter((s) => s.control === kind && s.field === within).map((spec) => ({
      id: { what: 'control', control: kind, group, index, property: spec.property } as FieldId,
      spec, position: positionConfidence(spec.confidence, groups, perGroup, group, index),
    })) };
  }
  return null;
}

/** The raw value of a spec in a byte, and the confidence of that value's code (`confirmed` when it has no code table). */
export function nibbleOf(spec: FieldSpec, byte: number): { raw: number; codeConfidence: 'confirmed' | 'likely' | 'unknown' } {
  const raw = spec.nibble === 'high' ? byte >> 4 : spec.nibble === 'low' ? byte & 0x0f : byte;
  const code = spec.codes?.find((c) => c.code === raw);
  if (!spec.codes && spec.property !== 'channel' && raw > 127) return { raw, codeConfidence: 'unknown' }; // decode calls it unreadable
  return { raw, codeConfidence: spec.codes ? (code?.confidence ?? 'unknown') : 'confirmed' };
}

// ---- capabilities ---------------------------------------------------------------------------------------------------

const RANK: Record<Confidence, number> = { unknown: 0, likely: 1, confirmed: 2 };
const weakestOf = (list: Confidence[]): Confidence => list.reduce((a, b) => (RANK[b] < RANK[a] ? b : a), 'confirmed' as Confidence);
const PROPERTIES: Property[] = ['type', 'mode', 'display', 'channel', 'number', 'lower', 'upper'];

export function capabilitiesOf(profile: DeviceProfile, engineVersion: string): Capabilities {
  const kinds = Object.keys(profile.layout.controls) as ControlKind[];
  const summary = (specs: readonly FieldSpec[], p: Property): Confidence | null => {
    const spec = specs.find((s) => s.property === p);
    if (!spec) return null;
    return weakestOf([spec.confidence.first, spec.confidence.last, spec.confidence.between, ...(spec.codes?.map((c) => c.confidence) ?? [])]);
  };
  const controls = {} as Capabilities['controls'];
  for (const k of kinds) {
    const specs = profile.fields.filter((f) => f.control === k);
    // the summary of a coded property looks at the positions only; the codes list carries the code detail
    controls[k] = Object.fromEntries(PROPERTIES.map((p) => {
      const spec = specs.find((s) => s.property === p);
      return [p, spec ? weakestOf([spec.confidence.first, spec.confidence.last, spec.confidence.between]) : null];
    })) as Record<Property, Confidence | null>;
  }
  const fader9 = Object.fromEntries(PROPERTIES.map((p) => [p, summary(profile.fader9Fields, p) ?? 'unknown'])) as Record<Property, Confidence>;
  const codes: Capabilities['codes'] = [];
  for (const s of profile.fields) for (const c of s.codes ?? []) codes.push({ control: s.control, property: s.property, value: c.name, confidence: c.confidence });
  for (const s of profile.fader9Fields) for (const c of s.codes ?? []) codes.push({ control: 'fader9', property: s.property, value: c.name, confidence: c.confidence });
  const namePositions: Capabilities['namePositions'] = [];
  for (let g = 1; g <= profile.layout.names.groups; g++)
    for (let c = 1; c <= profile.layout.names.chars; c++)
      namePositions.push({ group: g, char: c, confidence: profile.confirmedNamePositions.some(([pg, pc]) => pg === g && pc === c) ? 'confirmed' : 'likely' });
  return {
    engineVersion, profile: profile.id, knownFirmware: profile.knownFirmware, controls, fader9, codes,
    nameCharacters: profile.nameCodes.map((n) => ({ ...n })), namePositions,
    slotPlacement: profile.slot.placement, slotMove: profile.slot.move,
  };
}

/**
 * Is this one field with this value writable now? Without a value: is some value writable at that position. The same
 * rule `encode` applies (position `confirmed`, code `confirmed`), so a yes here never ends in `unconfirmed-fields`.
 */
export function canEncodeField(profile: DeviceProfile, field: FieldId, value?: string | number): boolean {
  const l = profile.layout;
  if (field.what === 'groupName') {
    if (!Number.isInteger(field.group) || !Number.isInteger(field.char)) return false;
    if (field.group < 1 || field.group > l.names.groups || field.char < 1 || field.char > l.names.chars) return false;
    if (!profile.confirmedNamePositions.some(([g, c]) => g === field.group && c === field.char)) return false;
    if (value === undefined) return profile.nameCodes.some((n) => n.confidence === 'confirmed');
    return profile.nameCodes.some((n) => n.char === value && n.confidence === 'confirmed');
  }
  const k = l.controls[field.control];
  if (!k || !Number.isInteger(field.group) || !Number.isInteger(field.index)) return false;
  const fader9 = field.control === 'fader' && field.index === k.perGroup + 1;
  if (field.group < 1 || field.group > k.groups || field.index < 1 || field.index > (fader9 ? k.perGroup + 1 : k.perGroup)) return false;
  const spec = (fader9 ? profile.fader9Fields : profile.fields.filter((f) => f.control === field.control)).find((s) => s.property === field.property);
  if (!spec) return false;
  const pos = fader9 ? positionConfidence(spec.confidence, l.fader9.groups, 1, field.group, 1)
    : positionConfidence(spec.confidence, k.groups, k.perGroup, field.group, field.index);
  if (pos !== 'confirmed') return false;
  if (value === undefined) return spec.codes ? spec.codes.some((c) => c.confidence === 'confirmed') : true;
  const enc = encodeValue(spec, value);
  return enc !== undefined && enc.codeConfidence === 'confirmed';
}
