// Step 2 of plan 0004: decode of the confirmed fields. The factory SndA decodes to factorySetup(1…18); each fixture
// pair of session 1 changes exactly the field named in its note (the byte-level check is fixtures.test.ts).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { uc4Engine } from '../../src/protocol/engine.ts';
import { faderfoxUc4 } from '../../src/protocol/profiles/uc4.ts';
import { factorySetup } from '../../src/model/factory.ts';
import type { DecodeResult, DumpMessage } from '../../src/protocol/types.ts';

const load = (n: string): Uint8Array => new Uint8Array(readFileSync(new URL(`../fixtures/sysex/${n}.syx`, import.meta.url)));
const src = { kind: 'file', name: 'x.syx' } as const;
const now = (): string => '2026-11-15T00:00:00.000Z';
function message(n: string): DumpMessage {
  const r = uc4Engine.parse(load(n), src, now);
  assert.ok(r.ok);
  return r.messages[0]!;
}
function decoded(n: string): Extract<DecodeResult, { ok: true }> {
  const d = uc4Engine.decode(message(n));
  assert.ok(d.ok, n);
  return d;
}

test('factory-SndA decodes to factorySetup(1…18), nothing unreadable', () => {
  const d = uc4Engine.decode(message('factory-SndA'), { makeId: (s) => factorySetup(s).id });
  assert.ok(d.ok);
  assert.deepEqual(d.setups.map((x) => x.slot), Array.from({ length: 18 }, (_, i) => i + 1));
  for (const x of d.setups) {
    assert.deepEqual(x.unreadable, [], `SE${x.slot}`);
    assert.deepEqual(x.setup, factorySetup(x.slot), `SE${x.slot}`);
  }
  assert.deepEqual(d.warnings, []);
});

test('base (SE16 after rESc) decodes to factorySetup(16); default id and name', () => {
  const d = decoded('base');
  assert.equal(d.setups.length, 1);
  const s = d.setups[0]!;
  assert.equal(s.slot, 16);
  assert.equal(s.setup.id, 'slot-16');
  assert.equal(s.setup.name, 'SE16');
  assert.deepEqual({ ...s.setup, id: 'factory-se16' }, factorySetup(16));
});

test('decode keeps the raw dump', () => {
  const m = message('base');
  const d = uc4Engine.decode(m);
  assert.ok(d.ok);
  assert.equal(d.raw, m.raw);
});

// ---- fixture pairs: the model difference to the predecessor ------------------------------------------------------

import { changes, pairs } from './pairs.ts';

for (const p of pairs) {
  test(`${p.name}: decodes as ${p.prev} plus exactly its noted change`, () => {
    const a = decoded(p.prev).setups[0]!, b = decoded(p.name).setups[0]!;
    assert.deepEqual(b.unreadable, []);
    assert.deepEqual(changes(a.setup, b.setup), [...p.expect].sort((x, y) => x[0].localeCompare(y[0])));
  });
}

test('every fixture except base, the factory-* and the sndc-* single dumps has a pair entry, and each pair is listed once', () => {
  const files = readdirSync(new URL('../fixtures/sysex/', import.meta.url)).filter((f) => f.endsWith('.syx')).map((f) => f.slice(0, -4));
  const expected = files.filter((n) => n !== 'base' && !n.startsWith('factory-') && !n.startsWith('sndc-')).sort();
  assert.deepEqual(pairs.map((p) => p.name).sort(), expected);
});

// ---- values outside the code tables -------------------------------------------------------------------------------

/** `base` with one image byte changed in the memory image only (frame and sums untouched), so only decode sees it. */
function withByte(address: number, value: number): DumpMessage {
  const m = message('base');
  const image = { ...m.image, bytes: m.image.bytes.slice() };
  image.bytes[address] = value;
  return { ...m, image };
}

test('a type code outside the table is unreadable: the factory value stays, the field is listed', () => {
  const block = 0x1c00 + 0x500 * 15;
  const d = uc4Engine.decode(withByte(block, 0x7f)); // encoder 1 type code 7 (no such type), channel 16
  assert.ok(d.ok);
  const s = d.setups[0]!;
  assert.equal(s.setup.encoderGroups[0]!.encoders[0]!.type, 'CCAb'); // factory
  assert.equal(s.setup.encoderGroups[0]!.encoders[0]!.channel, 16);
  assert.deepEqual(s.unreadable, [{ slot: 16, field: { what: 'control', control: 'encoder', group: 1, index: 1, property: 'type' } }]);
});

test('a green-button type code 0 (no OFF on the device), a number above 127 and a name code above 26 are unreadable', () => {
  const block = 0x1c00 + 0x500 * 15;
  const green = uc4Engine.decode(withByte(block + 10 * 64, 0x0f));
  assert.ok(green.ok);
  assert.deepEqual(green.setups[0]!.unreadable.map((u) => u.field), [{ what: 'control', control: 'greenButton', group: 1, index: 1, property: 'type' }]);
  const num = uc4Engine.decode(withByte(block + 64, 0x80));
  assert.ok(num.ok);
  assert.equal(num.setups[0]!.setup.encoderGroups[0]!.encoders[0]!.number, 8);
  assert.deepEqual(num.setups[0]!.unreadable.map((u) => u.field), [{ what: 'control', control: 'encoder', group: 1, index: 1, property: 'number' }]);
  const name = uc4Engine.decode(withByte(0x1660, 0x30));
  assert.ok(name.ok);
  assert.equal(name.setups[0]!.setup.encoderGroups[0]!.name, 'grp1');
  assert.deepEqual(name.setups[0]!.unreadable.map((u) => u.field), [{ what: 'groupName', group: 1, char: 1 }]);
});

test('a name byte FF (a paste of an empty clipboard on the device) is unreadable for every character, not an error', () => {
  const m = message('base');
  const image = { ...m.image, bytes: m.image.bytes.slice() };
  for (let k = 0; k < 4; k++) image.bytes[0x1660 + k] = 0xff;
  const d = uc4Engine.decode({ ...m, image });
  assert.ok(d.ok);
  assert.deepEqual(d.setups[0]!.unreadable.map((u) => u.field), [1, 2, 3, 4].map((char) => ({ what: 'groupName', group: 1, char })));
  assert.equal(d.setups[0]!.setup.encoderGroups[0]!.name, 'grp1'); // the factory name stands in; the byte stays in the raw dump
});

// ---- refusals and warnings -----------------------------------------------------------------------------------------

test('decode refuses a message with a bad checksum, a wrong length or a frame that cannot be written back', () => {
  const m = message('base');
  for (const code of ['bad-checksum', 'wrong-length', 'not-lossless'] as const) {
    const d = uc4Engine.decode({ ...m, problems: [{ code, message: 'x', whatToDo: 'y' }] });
    assert.ok(!d.ok && d.reason.code === code);
  }
});

test('decode with only an unknown-firmware problem decodes and warns', () => {
  const m = message('base');
  const d = uc4Engine.decode({ ...m, problems: [{ code: 'unknown-firmware', message: 'x', whatToDo: 'y' }] });
  assert.ok(d.ok);
  assert.deepEqual(d.warnings.map((w) => w.code), ['unknown-firmware']);
  assert.equal(d.setups.length, 1);
});

// ---- unknownRegions -----------------------------------------------------------------------------------------------

test('unknownRegions of base: the fader 9 filler, the push +4 low nibbles, the unconfirmed name bytes; not the encoder fields', () => {
  const d = decoded('base');
  const inRegion = (a: number): boolean => d.unknownRegions.some((r) => a >= r.address && a < r.address + r.length);
  const block = 0x1c00 + 0x500 * 15;
  for (let f = 1; f < 5; f++) for (let k = 0; k < 64; k++) assert.ok(!inRegion(block + f * 64 + k), `encoder field ${f} byte ${k}`);
  assert.ok(!inRegion(block), 'encoder g1c1 channel/type is confirmed');
  for (let k = 1; k < 64; k++) assert.ok(!inRegion(block + k), `encoder field 0 byte ${k}: the type nibble is confirmed at both ends and between`);
  assert.ok(!inRegion(block + 5 * 64), 'push g1c1 +0 is confirmed');
  assert.ok(!inRegion(block + 6 * 64), 'push g1c1 number');
  assert.ok(!inRegion(block + 5 * 64 + 5), 'push g1c2 +0 is confirmed (order, combined-se16)');
  assert.ok(inRegion(block + 9 * 64), 'push +4 has no confirmed low nibble');
  assert.ok(!inRegion(0x1660), 'name g1 char 1 confirmed');
  assert.ok(!inRegion(0x1661), 'name g1 char 2 confirmed (names-g1-4)');
  assert.ok(!inRegion(0x1ac0), 'fader 9 record is confirmed');
  assert.ok(inRegion(0x1ac0 + 40), 'fader 9 table padding');
});

test('unknownRegions are ascending, non-overlapping, and only inside the image', () => {
  const d = decoded('factory-SndA');
  const m = message('factory-SndA');
  let end = -1;
  for (const r of d.unknownRegions) {
    assert.ok(r.address >= end && r.length > 0);
    for (let k = 0; k < r.length; k++) assert.ok(m.image.covered[r.address + k]);
    end = r.address + r.length;
  }
});

test('profile tables: encoder type confirmed at both ends and between, fader 9 codes per code', () => {
  const type = faderfoxUc4.fields.find((f) => f.control === 'encoder' && f.property === 'type')!;
  assert.deepEqual(type.confidence, { first: 'confirmed', last: 'confirmed', between: 'confirmed' });
  const f9 = faderfoxUc4.fader9Fields.find((f) => f.property === 'type')!;
  assert.deepEqual(f9.codes!.map((c) => [c.name, c.confidence]), [['CCAb', 'confirmed'], ['PrGC', 'confirmed'], ['Pbnd', 'confirmed'], ['AFtt', 'confirmed']]);
});

test('no fixture has overlapping records with different values (image.conflicts is empty)', () => {
  for (const n of ['base', 'factory-SndA', 'enc1-ch01', 'last-types']) assert.deepEqual(message(n).image.conflicts, [], n);
});

test('overlapping records with different values: a not-lossless problem naming count, first address and setup; decode refuses', async () => {
  const { parseFrame, writeFrame, splitMessages } = await import('../../src/protocol/frame.ts');
  const f = parseFrame(splitMessages(load('base'))[0]!);
  assert.ok(f.ok);
  const dup = { ...f.frame.records[2]!, data: f.frame.records[2]!.data.slice() };
  dup.data[0] = dup.data[0]! ^ 1;
  dup.data[5] = dup.data[5]! ^ 1;
  dup.sumInDump = dup.data.reduce((a, b) => a + b, 0) & 0xffff; // sums fixed: only the conflict fires
  const bytes = writeFrame({ ...f.frame, records: [...f.frame.records, dup] });
  const r = uc4Engine.parse(bytes, src, now);
  assert.ok(r.ok);
  const m = r.messages[0]!;
  const p = m.problems.find((x) => x.code === 'not-lossless')!;
  assert.ok(p);
  assert.match(p.message, new RegExp(`^The dump is damaged: 2 addresses are written twice with different values \\(first 0x${dup.address.toString(16)}, SE16\\)\\.$`));
  assert.match(p.whatToDo, /Save the dump again on the UC4 \(SndA or Sndc\) and import the new file\./);
  const d = uc4Engine.decode(m);
  assert.ok(!d.ok && d.reason.code === 'not-lossless');
});

test('overlapping records with the same value are not a conflict', async () => {
  const { parseFrame, writeFrame, splitMessages } = await import('../../src/protocol/frame.ts');
  const f = parseFrame(splitMessages(load('base'))[0]!);
  assert.ok(f.ok);
  const dup = { ...f.frame.records[2]!, data: f.frame.records[2]!.data.slice() };
  const r = uc4Engine.parse(writeFrame({ ...f.frame, records: [...f.frame.records, dup] }), src, now);
  assert.ok(r.ok);
  assert.ok(!r.messages[0]!.problems.some((x) => x.code === 'not-lossless'));
});
