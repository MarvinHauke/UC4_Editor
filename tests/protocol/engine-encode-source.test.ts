// Plan 0007 step 3.1: each setup of an encode request may carry the dump it came from (`source`); its three per-slot
// regions are copied from that dump before the setup is patched.
import { test } from 'vitest';
import './markOLikely.ts'; // first: marks `o` as likely so the gate has a field to block (see the helper)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { uc4Engine } from '../../src/protocol/engine.ts';
import { faderfoxUc4 } from '../../src/protocol/profiles/uc4.ts';
import { parseFrame, splitMessages, writeFrame } from '../../src/protocol/frame.ts';
import type { DumpMessage, RawDump } from '../../src/protocol/types.ts';
import type { Setup } from '../../src/model/types.ts';

const dir = new URL('../fixtures/sysex/', import.meta.url);
const load = (n: string): Uint8Array => new Uint8Array(readFileSync(new URL(`${n}.syx`, dir)));
const src = { kind: 'file', name: 'x.syx' } as const;
const now = (): string => '2026-11-16T00:00:00.000Z';
function message(n: string, bytes = load(n)): DumpMessage {
  const r = uc4Engine.parse(bytes, src, now);
  assert.ok(r.ok);
  return r.messages[0]!;
}
function setupOf(m: DumpMessage, slot = 16): Setup {
  const d = uc4Engine.decode(m);
  assert.ok(d.ok);
  return structuredClone(d.setups.find((s) => s.slot === slot)!.setup);
}
/** `base` with image bytes changed and the record sums kept right (or deliberately wrong with `breakSum`). */
function edited(edits: Array<[number, number]>, breakSum = false): Uint8Array {
  const f = parseFrame(splitMessages(load('base'))[0]!);
  assert.ok(f.ok);
  const records = f.frame.records.map((r) => ({ ...r, data: r.data.slice() }));
  for (const [address, value] of edits) {
    const r = records.find((x) => address >= x.address && address < x.address + x.data.length)!;
    r.data[address - r.address] = value;
    if (!breakSum) r.sumInDump = r.data.reduce((a, b) => a + b, 0) & 0xffff;
  }
  return writeFrame({ ...f.frame, records });
}
const raw = (bytes: Uint8Array): RawDump => ({ bytes, source: src, capturedAt: now(), engineVersion: '0' });
const SE16 = 16;
/** The three per-slot regions of a slot, as [address, length]. */
const regionsOf = (slot: number): Array<[number, number]> => faderfoxUc4.layout.regions.map((r) => [r.base + r.stride * (slot - 1), r.size]);
const inRegion = (slot: number, a: number): boolean => regionsOf(slot).some(([from, len]) => a >= from && a < from + len);
const PUSH_PLUS4 = 0x1c00 + 0x500 * 15 + 9 * 64; // push g1c1 +4: its low nibble has no spec (unknown to the engine)

test('a SndA built on the factory SndA takes SE16 from the Sndc it came from, everything else stays', () => {
  const factory = message('factory-SndA');
  const combined = message('combined-se16');
  const r = uc4Engine.encode({ setups: [{ slot: SE16, setup: setupOf(combined), source: combined.raw }], base: factory.raw, message: 'all' }, now);
  assert.ok(r.ok, r.ok ? '' : r.reason.message);
  assert.deepEqual(r.written, []);
  const out = message('out', r.raw.bytes);
  for (const [from, len] of regionsOf(SE16))
    assert.deepEqual(out.image.bytes.slice(from, from + len), combined.image.bytes.slice(from, from + len));
  for (let a = 0; a < out.image.bytes.length; a++)
    if (!inRegion(SE16, a) && factory.image.covered[a]) assert.equal(out.image.bytes[a], factory.image.bytes[a], `0x${a.toString(16)}`);
  assert.ok(r.copied.reduce((n, c) => n + c.length, 0) >= regionsOf(SE16).reduce((n, [, l]) => n + l, 0));
  const back = uc4Engine.decode(out);
  assert.ok(back.ok);
  assert.deepEqual(back.setups.find((s) => s.slot === SE16)!.setup, setupOf(combined));
});

test('an unknown nibble of the source survives; without a source it is lost', () => {
  const source = message('with-unknown', edited([[PUSH_PLUS4, 0x03]]));
  const factory = message('factory-SndA');
  const withSource = uc4Engine.encode({ setups: [{ slot: SE16, setup: setupOf(source), source: source.raw }], base: factory.raw, message: 'all' }, now);
  assert.ok(withSource.ok);
  assert.equal(message('o', withSource.raw.bytes).image.bytes[PUSH_PLUS4], 0x03);
  const without = uc4Engine.encode({ setups: [{ slot: SE16, setup: setupOf(source) }], base: factory.raw, message: 'all' }, now);
  assert.ok(without.ok);
  assert.equal(message('o', without.raw.bytes).image.bytes[PUSH_PLUS4], factory.image.bytes[PUSH_PLUS4]);
});

test('an edit on top of a source is patched into the copied bytes; the unknown byte next to it stays', () => {
  const source = message('with-unknown', edited([[PUSH_PLUS4, 0x03]]));
  const s = setupOf(source);
  s.encoderGroups[0]!.pushButtons[0]!.mode = 'toGL'; // high nibble of the same byte
  const r = uc4Engine.encode({ setups: [{ slot: SE16, setup: s, source: source.raw }], base: source.raw, message: 'one' }, now);
  assert.ok(r.ok, r.ok ? '' : r.reason.message);
  assert.equal(r.written.length, 1);
  assert.equal(message('o', r.raw.bytes).image.bytes[PUSH_PLUS4], 0x13);
});

test('an unconfirmed edit on top of a source still refuses the whole encode', () => {
  const combined = message('combined-se16');
  const s = setupOf(combined);
  s.encoderGroups[2]!.name = 'orp3'; // name char o: likely
  const r = uc4Engine.encode({ setups: [{ slot: SE16, setup: s, source: combined.raw }], base: message('factory-SndA').raw, message: 'all' }, now);
  assert.ok(!r.ok && r.reason.code === 'unconfirmed-fields');
});

test('a source without the requested slot is slot-move-unconfirmed with no blocked fields', () => {
  const combined = message('combined-se16'); // holds slot 16 only
  const s = setupOf(combined);
  delete s.slot;
  const r = uc4Engine.encode({ setups: [{ slot: 3, setup: s, source: combined.raw }], base: message('factory-SndA').raw, message: 'all' }, now);
  assert.ok(!r.ok && r.reason.code === 'slot-move-unconfirmed');
  assert.deepEqual(r.blocked, []);
});

test('a source that cannot be read gives its failure: a wrong sum, garbage', () => {
  const factory = message('factory-SndA');
  const s = setupOf(message('combined-se16'));
  const badSum = uc4Engine.encode({ setups: [{ slot: SE16, setup: s, source: raw(edited([[PUSH_PLUS4, 0x03]], true)) }], base: factory.raw, message: 'all' }, now);
  assert.ok(!badSum.ok && badSum.reason.code === 'bad-checksum');
  assert.deepEqual(badSum.blocked, []);
  const garbage = uc4Engine.encode({ setups: [{ slot: SE16, setup: s, source: raw(new Uint8Array([1, 2, 3])) }], base: factory.raw, message: 'all' }, now);
  assert.ok(!garbage.ok);
  assert.deepEqual(garbage.blocked, []);
});

test('a source that is an 18-setup SndA serves any of its slots', () => {
  const factory = message('factory-SndA');
  const s = setupOf(factory, 5);
  const r = uc4Engine.encode({ setups: [{ slot: 5, setup: s, source: factory.raw }], base: factory.raw, message: 'all' }, now);
  assert.ok(r.ok);
  assert.deepEqual(r.raw.bytes, factory.raw.bytes);
});

test('a source with unknown firmware is refused with unknown-firmware', () => {
  const f = parseFrame(splitMessages(load('combined-se16'))[0]!);
  assert.ok(f.ok);
  const bytes = writeFrame({ ...f.frame, header: [f.frame.header[0]!, f.frame.header[1]!, 2, 6] });
  const s = setupOf(message('combined-se16'));
  const r = uc4Engine.encode({ setups: [{ slot: SE16, setup: s, source: raw(bytes) }], base: message('factory-SndA').raw, message: 'all' }, now);
  assert.ok(!r.ok && r.reason.code === 'unknown-firmware');
  assert.deepEqual(r.blocked, []);
});

test('a source of two concatenated dumps is refused with base-mismatch, in the words of the source', () => {
  const one = load('combined-se16');
  const two = new Uint8Array(one.length * 2);
  two.set(one); two.set(one, one.length);
  const r = uc4Engine.encode({ setups: [{ slot: SE16, setup: setupOf(message('combined-se16')), source: raw(two) }], base: message('factory-SndA').raw, message: 'all' }, now);
  assert.ok(!r.ok && r.reason.code === 'base-mismatch');
  assert.match(r.reason.message, /came from/);
});

test('a Sndc base whose source is another dump: the slot comes from the source, not the base', () => {
  const source = message('with-unknown', edited([[PUSH_PLUS4, 0x03]]));
  const base = message('enc1-n127'); // a Sndc of SE16 with other values
  const r = uc4Engine.encode({ setups: [{ slot: SE16, setup: setupOf(source), source: source.raw }], base: base.raw, message: 'one' }, now);
  assert.ok(r.ok, r.ok ? '' : r.reason.message);
  assert.deepEqual(r.written, []);
  const out = message('o', r.raw.bytes);
  for (const [from, len] of regionsOf(SE16))
    assert.deepEqual(out.image.bytes.slice(from, from + len), source.image.bytes.slice(from, from + len));
});
