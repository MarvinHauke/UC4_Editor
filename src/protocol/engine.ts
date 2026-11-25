// The protocol engine core: device-neutral, pure, total (never throws at a user action). Plan 0004.
// Step 1: `parse`. decode / encode / diff / capabilities follow in steps 2–5.
import { parseFrame, splitMessages, writeFrame, type FrameRules } from './frame.ts';
import { checkSendable as checkProfileSendable, type SendCheck } from './guard.ts';
import { buildImage, diffImages, type MemoryImage } from './image.ts';
import type { DeviceProfile } from './profile.ts';
import { faderfoxUc4 } from './profiles/uc4.ts';
import { canEncodeField, capabilitiesOf, decodeSlot, encodeSlot, nibbleOf, ownerOf, slotName, unknownRegions } from './setupCodec.ts';
import type { ByteDiff, ByteRange, Capabilities, CutResult, Confidence, FieldId, DecodeOptions, DecodeResult, DecodedSetup, DumpMessage, DumpSource, EncodeRequest, EncodeResult, Failure, FailureCode, ParseResult, RawDump, SlotField } from './types.ts';

export const ENGINE_VERSION = '0.13.0'; // 0.1.0 parse; 0.2.0 decode; 0.3.0 encode with a base; 0.4.0 encode without a base, diff; 0.5.0 capabilities; 0.6.0 order of push/green/fader, green mode and fader display at control 8 confirmed (combined-se16); 0.7.0 encoder type at control 8 confirmed (enc8g8-CCr1); 0.8.0 fader 9 Pbnd, AFtt, bPoL confirmed (fad9g1-*); 0.9.0 per-setup `source` in encode; 0.10.0 all group-name positions and every character but `o` confirmed (names-g1-4, names-g5-8); 0.11.0 cutSlot; 0.12.0 area guard (checkSendable; encode and cutSlot refuse a record outside the three write areas or a download type other than 02/03); 0.13.0 name code `o` confirmed by Faderfox's documentation

export interface Engine {
  parse(bytes: Uint8Array, source: DumpSource, now?: () => string): ParseResult;
  decode(message: DumpMessage, options?: DecodeOptions): DecodeResult;
  encode(request: EncodeRequest, now?: () => string): EncodeResult;
  diff(a: DumpMessage, b: DumpMessage): ByteDiff[];
  /**
   * The Sndc the UC4 would send for `slot` (1–18), cut out of a SndA: the header of the SndA with message type `02`, the
   * slot's records in the device's order (group names, fader 9 row, the block), the SndA's data, sums, padding and trailer.
   * Refuses (as a result) a dump that is not a clean SndA, a slot outside 1–18 and a slot whose bytes the SndA lacks.
   */
  cutSlot(sndA: RawDump, slot: number, now?: () => string): CutResult;
  capabilities(): Capabilities;
  /**
   * The area guard: may these bytes leave the editor? Refuses (as a result, never a throw) a message whose download type is not
   * one-setup or all-setups, any record outside the three write areas (group names, crossfader, setup data), and anything the
   * engine would not write. `encode` and `cutSlot` run it on their output; the connection runs it again before it sends.
   */
  checkSendable(bytes: Uint8Array): SendCheck;
  /**
   * Is this one field with this value writable now? Per control position, per code, per name position. The answer is for a
   * value that differs from the base: an unchanged value always encodes. Read "no" as "you can't change this", not as
   * "this setup can't be exported".
   */
  canEncode(field: FieldId, value?: string | number): boolean;
}

const defaultNow = (): string => new Date().toISOString();
const pad2 = (n: number): string => String(n).padStart(2, '0');

function presentSlots(profile: DeviceProfile, image: MemoryImage): number[] {
  const out: number[] = [];
  for (let s = 1; s <= profile.layout.slotCount; s++) {
    const whole = profile.layout.regions.every((r) => {
      const from = r.base + r.stride * (s - 1);
      for (let k = 0; k < r.size; k++) if (!image.covered[from + k]) return false;
      return true;
    });
    if (whole) out.push(s);
  }
  return out;
}

export function createEngine(profile: DeviceProfile): Engine {
  const rules: FrameRules = { manufacturerId: profile.framing.manufacturerId, recordDataLength: profile.framing.recordDataLength };
  const fw = (v: readonly string[]): string => v.join(', ');

  function parse(bytes: Uint8Array, source: DumpSource, now: () => string = defaultNow): ParseResult {
    const parts = splitMessages(bytes);
    if (parts.length === 0)
      return { ok: false, reason: { code: 'not-sysex', message: 'No SysEx message (F0 … F7) found in these bytes.', whatToDo: `Choose a .syx file saved from the ${profile.deviceName}.` } };
    const messages: DumpMessage[] = [];
    const skipped: { index: number; reason: Failure }[] = [];
    let used = 0;
    for (const [index, part] of parts.entries()) {
      const one = frameMessage(part, source, now);
      if (one.ok) { messages.push(one.message); used += part.length; }
      else if (index === 0) return { ok: false, reason: one.reason };
      else skipped.push({ index, reason: one.reason });
    }
    return { ok: true, messages, skipped, ignoredBytes: bytes.length - used };
  }

  function frameMessage(part: Uint8Array, source: DumpSource, now: () => string): { ok: true; message: DumpMessage } | { ok: false; reason: Failure } {
    const f = parseFrame(part, rules);
    if (!f.ok) {
      const whatToDo = f.code === 'wrong-manufacturer' || f.code === 'not-sysex'
        ? `Choose a dump saved from the ${profile.deviceName}.`
        : `The file is damaged or cut off; save the dump from the ${profile.deviceName} again.`;
      return { ok: false, reason: { code: f.code, message: f.reason, whatToDo } };
    }
    const type = profile.framing.messageTypes[f.frame.header[1]!];
    if (!type)
      return { ok: false, reason: { code: 'unknown-message-type', message: `Message type ${f.frame.header[1]!.toString(16).padStart(2, '0')} is not one of: ${Object.entries(profile.framing.messageTypes).map(([c, t]) => `${profile.framing.messageNames[t]} (${pad2(Number(c))})`).join(', ')}.`, whatToDo: `Only these dump types of the ${profile.deviceName} can be read.` } };
    const problems: Failure[] = [];
    const image = buildImage([f.frame]);
    const slots = presentSlots(profile, image);

    if (!f.frame.lossless)
      problems.push({ code: 'not-lossless', message: `The message cannot be written back unchanged: ${f.warnings.join('; ')}.`, whatToDo: `Save the dump from the ${profile.deviceName} again.` });
    const clashes = [...new Set(image.conflicts)].sort((a, b) => a - b);
    if (clashes.length > 0) {
      const first = clashes[0]!;
      const inSlot = profile.layout.regions.map((r) => ({ r, o: first - r.base })).find(({ r, o }) => o >= 0 && o < r.stride * profile.layout.slotCount && o % r.stride < r.size);
      const where = inSlot ? `, ${slotName(Math.floor(inSlot.o / inSlot.r.stride) + 1)}` : '';
      problems.push({ code: 'not-lossless', message: `The dump is damaged: ${clashes.length} address${clashes.length === 1 ? ' is' : 'es are'} written twice with different values (first 0x${first.toString(16)}${where}).`, whatToDo: `Save the dump again on the ${profile.deviceName} (${Object.values(profile.framing.messageNames).join(' or ')}) and import the new file.` });
    }
    const bad = f.frame.records.filter((r) => !r.sumOk);
    if (bad.length > 0)
      problems.push({ code: 'bad-checksum', message: `${bad.length} record(s) have a wrong checksum (first at 0x${bad[0]!.address.toString(16)}).`, whatToDo: `The dump was damaged in transfer; save it from the ${profile.deviceName} again.` });
    const wantLen = profile.framing.messageLength[type];
    const wantRecords = profile.framing.recordsPerMessage[type];
    const name = profile.framing.messageNames[type];
    if (part.length !== wantLen || f.frame.records.length !== wantRecords)
      problems.push({ code: 'wrong-length', message: `A ${name} message has ${wantLen} bytes in ${wantRecords} records; this one has ${part.length} bytes in ${f.frame.records.length} records.`, whatToDo: `The dump is incomplete or not from this firmware; save it from the ${profile.deviceName} again.` });
    else if (slots.length !== profile.framing.slotsPerMessage[type])
      problems.push({ code: 'wrong-length', message: `A ${name} message covers ${profile.framing.slotsPerMessage[type]} setup(s); this one covers ${slots.length} (slots ${slots.join(', ') || 'none'}).`, whatToDo: `The dump's addresses do not match its type; save it from the ${profile.deviceName} again.` });
    const firmware = `${pad2(f.frame.header[2]!)}.${pad2(f.frame.header[3]!)}`;
    if (!profile.knownFirmware.includes(firmware))
      problems.push({ code: 'unknown-firmware', message: `Firmware ${firmware} is not known (known: ${fw(profile.knownFirmware)}).`, whatToDo: 'Reading may work, but writing to the device for this firmware is not supported yet.' });

    return { ok: true, message: { raw: { bytes: part.slice(), source, capturedAt: now(), engineVersion: ENGINE_VERSION }, type, firmware, frame: f.frame, image, slots, problems } };
  }

  /** Problems that make `decode` refuse (plan 0004 decision 18); the rest only warn. */
  const REFUSES: readonly FailureCode[] = ['bad-checksum', 'wrong-length', 'not-lossless'];

  function decode(message: DumpMessage, options: DecodeOptions = {}): DecodeResult {
    const refusal = message.problems.find((p) => REFUSES.includes(p.code));
    if (refusal) return { ok: false, reason: refusal };
    const makeId = options.makeId ?? ((slot: number): string => `slot-${String(slot).padStart(2, '0')}`);
    const setups: DecodedSetup[] = message.slots.map((slot) => ({ slot, ...decodeSlot(profile, message.image, slot, makeId(slot)) }));
    return {
      ok: true,
      raw: message.raw,
      setups,
      unknownRegions: unknownRegions(profile, message.image, message.slots),
      warnings: message.problems.filter((p) => !REFUSES.includes(p.code)),
    };
  }

  const fail = (code: FailureCode, message: string, whatToDo: string, blocked: SlotField[] = []): EncodeResult =>
    ({ ok: false, reason: { code, message, whatToDo }, blocked });

  /**
   * Patches the base dump: every field of the request is compared with what the base holds; changed fields that are
   * `confirmed` are written into a copy of the base's frame, the sums of changed records are recomputed, everything
   * else (unknown bytes, `likely` fields, padding, header, trailer) is copied (plan 0004, "encode algorithm").
   */
  function encode(request: EncodeRequest, now: () => string = defaultNow): EncodeResult {
    let baseRaw = request.base;
    if (!baseRaw) {
      // No base: patch the profile's factory SndA. Only a SndA can be built that way until the send test (decision 5).
      if (request.message !== 'all')
        return fail('no-base', `A ${profile.framing.messageNames[request.message]} cannot be built without a dump to start from.`, `Choose a ${profile.framing.messageNames[request.message]} dump as the base, or write a ${profile.framing.messageNames.all}.`);
      baseRaw = { bytes: profile.factoryDump(), source: { kind: 'generated' }, capturedAt: now(), engineVersion: ENGINE_VERSION };
    }
    const parsed = parse(baseRaw.bytes, baseRaw.source, now);
    if (!parsed.ok) return fail(parsed.reason.code, parsed.reason.message, parsed.reason.whatToDo);
    if (parsed.messages.length !== 1 || parsed.skipped.length > 0 || parsed.ignoredBytes > 0)
      return fail('base-mismatch', 'The base is not exactly one message.', 'Use one Sndc or SndA dump as the base.');
    const base = parsed.messages[0]!;
    const refusal = base.problems.find((p) => REFUSES.includes(p.code) || p.code === 'unknown-firmware');
    if (refusal) return fail(refusal.code, refusal.message, refusal.code === 'unknown-firmware' ? `Writing is supported only for firmware ${profile.knownFirmware.join(', ')}.` : refusal.whatToDo);
    if (request.message !== base.type)
      return fail('base-mismatch', `The base is a ${profile.framing.messageNames[base.type]} dump; a ${profile.framing.messageNames[request.message]} dump cannot be built from it yet.`, `Use a ${profile.framing.messageNames[request.message]} dump as the base.`);
    if (request.setups.length === 0 || (request.message === 'one' && request.setups.length !== 1))
      return fail('invalid-setup', `A ${profile.framing.messageNames[request.message]} message needs ${request.message === 'one' ? 'exactly one setup' : 'at least one setup'}.`, 'Choose the setups to write.');
    const slotsSeen = new Set<number>();
    for (const { slot } of request.setups) {
      if (slotsSeen.has(slot)) return fail('invalid-setup', `Slot ${slot} appears twice.`, 'Give each setup its own slot.');
      slotsSeen.add(slot);
    }
    // Writing a setup to another slot than the base's (or than its own) is blocked until the profile says the move is confirmed.
    if (profile.slot.move !== 'confirmed') {
      const moved = request.setups.filter(({ slot }) => !base.slots.includes(slot)).map(({ slot }) => slot);
      if (moved.length > 0)
        return fail('slot-move-unconfirmed', `The base has no setup in slot ${moved.join(', ')}; writing a setup to another slot than the base's is not confirmed yet.`, 'Write each setup to the slot it has in the base.');
      const relabelled = request.setups.filter(({ slot, setup }) => setup?.slot !== undefined && setup.slot !== slot);
      if (relabelled.length > 0)
        return fail('slot-move-unconfirmed', `The setup is meant for slot ${relabelled[0]!.setup.slot} but the request writes it to slot ${relabelled[0]!.slot}; writing a setup to another slot than its own is not confirmed yet.`, 'Write each setup to its own slot.');
    }

    // A setup's own source: its slot's regions come from the dump it was read from, not from the base (plan 0007 step 3.1).
    const frame = { ...base.frame, records: base.frame.records.map((r) => ({ ...r, data: r.data.slice() })) };
    const image = { ...base.image, bytes: base.image.bytes.slice() };
    const touched = new Set<number>();
    const parsedSources = new Map<RawDump, DumpMessage>();
    for (const { slot, source } of request.setups) {
      if (!source) continue;
      let src = parsedSources.get(source);
      if (!src) {
        const p = parse(source.bytes, source.source, now);
        if (!p.ok) return fail(p.reason.code, `The dump a setup came from cannot be read: ${p.reason.message}`, p.reason.whatToDo);
        if (p.messages.length !== 1 || p.skipped.length > 0 || p.ignoredBytes > 0)
          return fail('base-mismatch', 'The dump a setup came from is not exactly one message.', 'Use one Sndc or SndA dump as the source.');
        const bad = p.messages[0]!.problems.find((x) => REFUSES.includes(x.code) || x.code === 'unknown-firmware');
        if (bad) return fail(bad.code, `The dump a setup came from cannot be used: ${bad.message}`, bad.whatToDo);
        src = p.messages[0]!;
        parsedSources.set(source, src);
      }
      if (!src.slots.includes(slot))
        return fail('slot-move-unconfirmed', `The dump setup ${slot} came from has no setup in slot ${slot}; writing a setup to another slot than its dump's is not confirmed yet.`, 'Write each setup to the slot it has in its dump.');
      for (const region of profile.layout.regions) {
        const from = region.base + region.stride * (slot - 1);
        for (let a = from; a < from + region.size; a++) {
          if (!src.image.covered[a]) return fail('base-mismatch', `The dump setup ${slot} came from has no byte at 0x${a.toString(16)}.`, 'Use a complete dump as the source.');
          if (src.image.bytes[a] === image.bytes[a]) continue;
          const rec = frame.records.findIndex((r) => a >= r.address && a < r.address + r.data.length);
          if (rec < 0) return fail('base-mismatch', `The base has no byte at 0x${a.toString(16)}.`, 'Use a complete dump as the base.');
          frame.records[rec]!.data[a - frame.records[rec]!.address] = src.image.bytes[a]!;
          image.bytes[a] = src.image.bytes[a]!;
          touched.add(rec);
        }
      }
    }

    const patches = [];
    const written: SlotField[] = [], blocked: SlotField[] = [], invalid: SlotField[] = [];
    for (const { slot, setup } of request.setups) {
      const e = encodeSlot(profile, image, slot, setup);
      patches.push(...e.patches); written.push(...e.written); blocked.push(...e.blocked); invalid.push(...e.invalid);
    }
    if (invalid.length > 0)
      return fail('invalid-setup', `${invalid.length} field(s) hold a value the ${profile.deviceName} cannot store.`, 'Correct these fields (see the list) and try again.', invalid);
    if (blocked.length > 0)
      return fail('unconfirmed-fields', `${blocked.length} changed field(s) are not confirmed yet, so they cannot be written.`, 'Undo these changes, or wait until the format of these fields is confirmed.', blocked);

    const written8 = new Set<number>();
    for (const p of patches) {
      const rec = frame.records.findIndex((r) => p.address >= r.address && p.address < r.address + r.data.length);
      if (rec < 0) return fail('base-mismatch', `The base has no byte at 0x${p.address.toString(16)}.`, 'Use a complete dump as the base.');
      const r = frame.records[rec]!;
      const at = p.address - r.address;
      r.data[at] = (r.data[at]! & ~p.mask) | p.value;
      touched.add(rec); written8.add(p.address);
    }
    for (const rec of touched) {
      const r = frame.records[rec]!;
      let sum = 0;
      for (const v of r.data) sum = (sum + v) & 0xffff;
      r.sumInDump = sum; r.sumComputed = sum; r.sumOk = true;
    }
    const bytes = writeFrame(frame, rules);
    const copied: ByteRange[] = [];
    for (let a = 0; a < base.image.covered.length; a++) {
      if (!base.image.covered[a] || written8.has(a)) continue;
      const last = copied[copied.length - 1];
      if (last && last.address + last.length === a) last.length++;
      else copied.push({ address: a, length: 1 });
    }
    // Cheap insurance: what we generate must read back as the same kind of clean message (it may go to the device one day).
    const check = parse(bytes, { kind: 'generated' }, now);
    const back = check.ok && check.messages.length === 1 ? check.messages[0]! : undefined;
    if (!back || !check.ok || check.skipped.length > 0 || check.ignoredBytes > 0 || back.problems.length > 0 || back.type !== base.type || bytes.length !== base.raw.bytes.length || back.slots.join() !== base.slots.join())
      return fail('not-lossless', 'The generated dump did not pass its own check.', 'Report this: the encoder produced a dump it cannot read back.');
    // The output must hold every requested value: encoding the request against it again changes nothing.
    if (back && request.setups.some(({ slot, setup }) => encodeSlot(profile, back.image, slot, setup).written.length > 0))
      return fail('not-lossless', 'The generated dump does not hold the requested values.', 'Report this: the encoder wrote to the wrong place.');
    // The copy from each source landed: its slot's regions read back equal to the source, except at bytes the request patched.
    for (const { slot, source } of request.setups) {
      const s = source && parsedSources.get(source);
      if (!s || !back) continue;
      for (const region of profile.layout.regions) {
        const from = region.base + region.stride * (slot - 1);
        for (let a = from; a < from + region.size; a++)
          if (!written8.has(a) && back.image.bytes[a] !== s.image.bytes[a])
            return fail('not-lossless', 'The bytes copied from a setup\'s dump did not land.', 'Report this: the encoder copied to the wrong place.');
      }
    }
    const guard = checkProfileSendable(profile, bytes);
    if (!guard.ok) return fail(guard.reason.code, guard.reason.message, guard.reason.whatToDo);
    return { ok: true, raw: { bytes, source: { kind: 'generated' }, capturedAt: now(), engineVersion: ENGINE_VERSION }, written, copied };
  }

  function cutSlot(sndA: RawDump, slot: number, now: () => string = defaultNow): CutResult {
    const no = (code: FailureCode, message: string, whatToDo: string): CutResult => ({ ok: false, reason: { code, message, whatToDo } });
    const parsed = parse(sndA.bytes, sndA.source, now);
    if (!parsed.ok) return no(parsed.reason.code, parsed.reason.message, parsed.reason.whatToDo);
    if (parsed.messages.length !== 1 || parsed.skipped.length > 0 || parsed.ignoredBytes > 0)
      return no('base-mismatch', 'The backup is not exactly one message.', `Use one ${profile.framing.messageNames.all} dump.`);
    const all = parsed.messages[0]!;
    const refusal = all.problems.find((p) => REFUSES.includes(p.code) || p.code === 'unknown-firmware');
    if (refusal) return no(refusal.code, refusal.message, refusal.code === 'unknown-firmware' ? `Only firmware ${profile.knownFirmware.join(', ')} is supported.` : refusal.whatToDo);
    if (all.type !== 'all')
      return no('base-mismatch', `This is a ${profile.framing.messageNames[all.type]} dump; a setup can only be cut out of a ${profile.framing.messageNames.all}.`, `Use a ${profile.framing.messageNames.all} dump.`);
    if (!Number.isInteger(slot) || slot < 1 || slot > profile.layout.slotCount)
      return no('invalid-setup', `Slot ${slot} does not exist; the ${profile.deviceName} has setups 1–${profile.layout.slotCount}.`, 'Choose a setup from 1 to ' + profile.layout.slotCount + '.');
    const oneEntry = Object.entries(profile.framing.messageTypes).find(([, t]) => t === 'one');
    if (!oneEntry) return no('unknown-message-type', `The ${profile.deviceName} has no single-setup dump type.`, 'A setup cannot be cut for this device.');
    const oneCode = Number(oneEntry[0]);
    // The slot's records (the coverage check below is a guard: parse already refuses a SndA that lacks a record). For each region, the SndA's records that hold its bytes (a name record is shorter than the SndA's).
    const records = [];
    for (const region of profile.layout.regions) {
      const from = region.base + region.stride * (slot - 1);
      for (let a = from; a < from + region.size; a += rules.recordDataLength) {
        const len = Math.min(rules.recordDataLength, from + region.size - a);
        const data = new Uint8Array(len);
        for (let k = 0; k < len; k++) {
          if (!all.image.covered[a + k]) return no('base-mismatch', `The ${profile.framing.messageNames.all} has no byte at 0x${(a + k).toString(16)}, so setup ${slot} cannot be cut out.`, `Save the ${profile.framing.messageNames.all} from the ${profile.deviceName} again.`);
          data[k] = all.image.bytes[a + k]!;
        }
        let sum = 0;
        for (const v of data) sum = (sum + v) & 0xffff;
        records.push({ address: a, data, sumInDump: sum, sumComputed: sum, sumOk: true, frameOffset: 0, paddingAfter: profile.framing.padding });
      }
    }
    const frame = { header: [all.frame.header[0]!, oneCode, all.frame.header[2]!, all.frame.header[3]!], records, trailer: all.frame.trailer, strayPadding: all.frame.strayPadding, lossless: true };
    const bytes = writeFrame(frame, rules);
    // What we cut must read back as a clean Sndc of that slot with the SndA's bytes.
    const check = parse(bytes, { kind: 'generated' }, now);
    const back = check.ok && check.messages.length === 1 ? check.messages[0]! : undefined;
    if (!back || back.problems.length > 0 || back.type !== 'one' || back.slots.join() !== String(slot))
      return no('not-lossless', 'The cut setup did not pass its own check.', 'Report this: the engine produced a dump it cannot read back.');
    const guard = checkProfileSendable(profile, bytes);
    if (!guard.ok) return no(guard.reason.code, guard.reason.message, guard.reason.whatToDo);
    return { ok: true, raw: { bytes, source: { kind: 'generated' }, capturedAt: now(), engineVersion: ENGINE_VERSION } };
  }

  const rank: Record<Confidence, number> = { unknown: 0, likely: 1, confirmed: 2 };
  const weakest = (...c: Confidence[]): Confidence => c.reduce((a, b) => (rank[b] < rank[a] ? b : a));

  /**
   * Byte differences of two messages' images, named by setup and field. A byte that holds two nibble fields gives one
   * entry per changed nibble (same address, same before/after bytes); a changed byte no field explains gives one entry
   * with `field: null`. `confidence` is the weakest of the position and the codes of both values. `before`/`after` are
   * `null` where an image does not cover the address.
   */
  function diff(a: DumpMessage, b: DumpMessage): ByteDiff[] {
    const out: ByteDiff[] = [];
    for (const ch of diffImages(a.image, b.image)) {
      const owner = ownerOf(profile, ch.address);
      const slot = owner?.slot ?? null;
      // A side the image does not cover has no value to compare: every field of the byte is named, weighed by its position and the present value's code.
      const bothSides = ch.before !== null && ch.after !== null;
      const hit = !owner ? []
        : bothSides ? owner.fields.filter((f) => !f.spec || nibbleOf(f.spec, ch.before!).raw !== nibbleOf(f.spec, ch.after!).raw)
        : owner.fields;
      if (hit.length === 0) { out.push({ ...ch, slot, field: null, confidence: null }); continue; }
      for (const f of hit) {
        let conf = f.position;
        for (const v of [ch.before, ch.after]) {
          if (v === null) continue;
          if (f.spec) conf = weakest(conf, nibbleOf(f.spec, v).codeConfidence);
          else if (f.id.what === 'groupName') conf = weakest(conf, profile.nameCodes[v]?.confidence ?? 'unknown');
        }
        out.push({ ...ch, slot, field: f.id, confidence: conf });
      }
    }
    return out;
  }

  const caps = capabilitiesOf(profile, ENGINE_VERSION);
  const capabilities = (): Capabilities => structuredClone(caps);
  const canEncode = (field: FieldId, value?: string | number): boolean => canEncodeField(profile, field, value);

  const checkSendable = (bytes: Uint8Array): SendCheck => checkProfileSendable(profile, bytes);

  return { parse, decode, encode, cutSlot, diff, capabilities, canEncode, checkSendable };
}

export const uc4Engine: Engine = createEngine(faderfoxUc4);
