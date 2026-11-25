// The area guard (plan 0011): nothing leaves the engine that writes outside group names (0x1480), crossfader (0x1700) or
// setup data (0x1C00), or that is not a one-setup / all-setups download. Faderfox's rule, 2026-11-25.
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { createEngine, uc4Engine } from '../../src/protocol/engine.ts';
import { faderfoxUc4 } from '../../src/protocol/profiles/uc4.ts';
import { parseFrame, splitMessages, writeFrame, type DumpRecord } from '../../src/protocol/frame.ts';
import type { RawDump } from '../../src/protocol/types.ts';
import type { Setup } from '../../src/model/types.ts';

const dir = new URL('../fixtures/sysex/', import.meta.url);
const load = (n: string): Uint8Array => new Uint8Array(readFileSync(new URL(`${n}.syx`, dir)));
const src = { kind: 'file', name: 'x.syx' } as const;
const now = (): string => '2026-11-25T00:00:00.000Z';
const raw = (bytes: Uint8Array): RawDump => ({ bytes, source: src, capturedAt: now(), engineVersion: '0' });

/** A fixture's frame with `change` applied, written back (sums are kept as received). */
function changed(name: string, change: (f: { header: number[]; records: DumpRecord[] }) => void): Uint8Array {
  const p = parseFrame(splitMessages(load(name))[0]!);
  if (!p.ok) throw new Error('fixture unreadable');
  const frame = { ...p.frame, header: p.frame.header.slice(), records: p.frame.records.map((r) => ({ ...r })) };
  change(frame);
  return writeFrame(frame);
}

describe('checkSendable', () => {
  test('the Sndc and the SndA fixtures pass (real dumps of the device)', () => {
    expect(uc4Engine.checkSendable(load('base'))).toEqual({ ok: true });
    expect(uc4Engine.checkSendable(load('combined-se16'))).toEqual({ ok: true });
    expect(uc4Engine.checkSendable(load('factory-SndA'))).toEqual({ ok: true });
  });

  test('every record of the SndA lies in one of the three areas, together they cover all of it', () => {
    const areas = faderfoxUc4.layout.writeAreas;
    expect(areas.map((a) => [a.from, a.to])).toEqual([[0x1480, 0x1700], [0x1700, 0x1c00], [0x1c00, 0x8000]]);
    const total = areas.reduce((n, a) => n + a.to - a.from, 0);
    expect(total).toBe(27520); // 640 + 1280 + 25600, Faderfox's sizes
  });

  test('refuses a record outside the areas, with a reason and no throw', () => {
    for (const address of [0x0000, 0x1000, 0x147f - 0x3f, 0x8000]) {
      const bytes = changed('base', (f) => { f.records[0]!.address = address; });
      const r = uc4Engine.checkSendable(bytes);
      expect(r.ok).toBe(false);
      if (!r.ok) { expect(r.reason.code).toBe('outside-write-area'); expect(r.reason.message).toContain(address.toString(16).toUpperCase()); }
    }
  });

  test('refuses a record that starts inside but runs past the end of the last area, or across an area edge', () => {
    const past = changed('base', (f) => { f.records[f.records.length - 1]!.address = 0x7fe0; });
    expect(uc4Engine.checkSendable(past)).toMatchObject({ ok: false, reason: { code: 'outside-write-area' } });
    // a 64-byte record at 0x16e1 would run from the group names into the crossfader area
    const across = changed('base', (f) => { f.records[1]!.address = 0x16e1; });
    expect(uc4Engine.checkSendable(across)).toMatchObject({ ok: false, reason: { code: 'outside-write-area' } });
  });

  test('refuses download type 01 (firmware) and any type other than 02 and 03', () => {
    for (const type of [0x01, 0x00, 0x04, 0x7f]) {
      const r = uc4Engine.checkSendable(changed('base', (f) => { f.header[1] = type; }));
      expect(r).toMatchObject({ ok: false, reason: { code: 'unsafe-download-type' } });
    }
    expect(uc4Engine.checkSendable(changed('base', (f) => { f.header[1] = 0x03; }))).toEqual({ ok: true });
  });

  test('the write types are an explicit list of 02 and 03, each also a type the engine reads, never 01', () => {
    expect(faderfoxUc4.framing.writeTypes).toEqual([0x02, 0x03]);
    for (const t of faderfoxUc4.framing.writeTypes) expect(faderfoxUc4.framing.messageTypes[t]).toBeDefined();
  });

  test('a type the engine can read but the profile does not write is refused', () => {
    const readOnly = createEngine({ ...faderfoxUc4, framing: { ...faderfoxUc4.framing, writeTypes: [0x02] } });
    expect(readOnly.checkSendable(changed('base', (f) => { f.header[1] = 0x03; }))).toMatchObject({ ok: false, reason: { code: 'unsafe-download-type' } });
    expect(readOnly.checkSendable(load('base'))).toEqual({ ok: true });
  });

  test('refuses a message with a command the engine does not write (e.g. an app function 4E), and stray bytes', () => {
    const base = load('base');
    // insert the token 4E 20 10 (app function) right before the trailer's cmd F token: 4F 20 16 ... F7
    const at = base.length - 1 - 3;
    const withFunc = Uint8Array.from([...base.slice(0, at), 0x4e, 0x20, 0x10, ...base.slice(at)]);
    expect(uc4Engine.checkSendable(withFunc)).toMatchObject({ ok: false, reason: { code: 'not-lossless' } });
    expect(uc4Engine.checkSendable(Uint8Array.from([...base, 0x01]))).toMatchObject({ ok: false, reason: { code: 'not-sysex' } });
    expect(uc4Engine.checkSendable(new Uint8Array())).toMatchObject({ ok: false, reason: { code: 'not-sysex' } });
    expect(uc4Engine.checkSendable(Uint8Array.from([0xf0, 0x01, 0xf7]))).toMatchObject({ ok: false });
  });

  test('one bad message among several refuses the whole thing', () => {
    const bad = changed('base', (f) => { f.records[3]!.address = 0x2000 - 0x1000; });
    const two = Uint8Array.from([...load('base'), ...bad]);
    expect(uc4Engine.checkSendable(two)).toMatchObject({ ok: false, reason: { code: 'outside-write-area' } });
  });
});

describe('what the engine makes passes the guard (the current real sends)', () => {
  test('cutSlot of every slot of the factory SndA', () => {
    for (let slot = 1; slot <= 18; slot++) {
      const r = uc4Engine.cutSlot(raw(load('factory-SndA')), slot, now);
      expect(r.ok, `slot ${slot}`).toBe(true);
      if (r.ok) expect(uc4Engine.checkSendable(r.raw.bytes)).toEqual({ ok: true });
    }
  });

  test('encode of one setup on a Sndc base and of the factory SndA without a base', () => {
    const m = uc4Engine.parse(load('base'), src, now);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const d = uc4Engine.decode(m.messages[0]!);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    const setup: Setup = structuredClone(d.setups[0]!.setup);
    setup.encoderGroups[0]!.encoders[0]!.channel = 3;
    const one = uc4Engine.encode({ message: 'one', base: raw(load('base')), setups: [{ slot: 16, setup }] }, now);
    expect(one.ok).toBe(true);
    if (one.ok) expect(uc4Engine.checkSendable(one.raw.bytes)).toEqual({ ok: true });

    const all = uc4Engine.parse(load('factory-SndA'), src, now);
    expect(all.ok).toBe(true);
    if (!all.ok) return;
    const da = uc4Engine.decode(all.messages[0]!);
    expect(da.ok).toBe(true);
    if (!da.ok) return;
    const whole = uc4Engine.encode({ message: 'all', setups: da.setups.map((s) => ({ slot: s.slot, setup: s.setup })) }, now);
    expect(whole.ok).toBe(true);
    if (whole.ok) expect(uc4Engine.checkSendable(whole.raw.bytes)).toEqual({ ok: true });
  });

  test('cutSlot and encode run the guard on their output: with no write area they refuse what they would make', () => {
    const closed = createEngine({ ...faderfoxUc4, layout: { ...faderfoxUc4.layout, writeAreas: [] } });
    const cut = closed.cutSlot(raw(load('factory-SndA')), 16, now);
    expect(cut).toMatchObject({ ok: false, reason: { code: 'outside-write-area' } });
    const m = closed.parse(load('base'), src, now);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const d = closed.decode(m.messages[0]!);
    if (!d.ok) throw new Error('decode');
    const r = closed.encode({ message: 'one', base: raw(load('base')), setups: [{ slot: 16, setup: d.setups[0]!.setup }] }, now);
    expect(r).toMatchObject({ ok: false, reason: { code: 'outside-write-area' } });
  });
});
