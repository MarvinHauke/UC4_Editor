// Step 4 of plan 0004: encode without a base (the factory SndA asset) and diff.
import { test } from 'vitest';
import './markOLikely.ts'; // first: marks `o` as likely so the gate has a field to block (see the helper)
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { uc4Engine, ENGINE_VERSION } from '../../src/protocol/engine.ts';
import { faderfoxUc4 } from '../../src/protocol/profiles/uc4.ts';
import { factorySetup } from '../../src/model/factory.ts';
import type { DumpMessage, FieldId } from '../../src/protocol/types.ts';
import { enc, pbt, btn, fad, nm, pairs } from './pairs.ts';

const load = (n: string): Uint8Array => new Uint8Array(readFileSync(new URL(`../fixtures/sysex/${n}.syx`, import.meta.url)));
const src = { kind: 'file', name: 'x.syx' } as const;
const now = (): string => '2026-11-15T00:00:00.000Z';
function message(n: string): DumpMessage {
  const r = uc4Engine.parse(load(n), src, now);
  assert.ok(r.ok);
  return r.messages[0]!;
}

// ---- the factory asset ------------------------------------------------------------------------------------------------

test('the factory dump of the profile equals factory-SndA.syx byte for byte', () => {
  assert.deepEqual(faderfoxUc4.factoryDump(), load('factory-SndA'));
});

test('the generated asset is up to date with the fixture (tools/uc4-factory.ts check)', () => {
  const out = execFileSync(process.execPath, [fileURLToPath(new URL('../../tools/uc4-factory.ts', import.meta.url)), 'check'], { encoding: 'utf8', timeout: 20000 });
  assert.match(out, /up to date/);
});

// ---- encode without a base ----------------------------------------------------------------------------------------

test('without a base the factory SndA is patched: one changed field, 17 slots stay factory', () => {
  const setups = [5, 16].map((slot) => ({ slot, setup: factorySetup(slot) }));
  setups[0]!.setup.encoderGroups[0]!.encoders[0]!.number = 99;
  const r = uc4Engine.encode({ setups, message: 'all' }, now);
  assert.ok(r.ok, r.ok ? '' : r.reason.message);
  assert.deepEqual(r.written, [{ slot: 5, field: { what: 'control', control: 'encoder', group: 1, index: 1, property: 'number' } }]);
  assert.equal(r.raw.bytes.length, 100640);
  assert.deepEqual(r.raw.source, { kind: 'generated' });
  assert.equal(r.raw.engineVersion, ENGINE_VERSION);
  const back = uc4Engine.parse(r.raw.bytes, src, now);
  assert.ok(back.ok);
  const d = uc4Engine.decode(back.messages[0]!, { makeId: (s) => factorySetup(s).id });
  assert.ok(d.ok);
  assert.equal(d.setups.length, 18);
  for (const s of d.setups) {
    const want = factorySetup(s.slot);
    if (s.slot === 5) want.encoderGroups[0]!.encoders[0]!.number = 99;
    assert.deepEqual(s.setup, want, `SE${s.slot}`);
  }
  // a changed byte is "written", every other covered byte is "copied"
  assert.equal(r.copied.reduce((a, c) => a + c.length, 0), 27520 - 1);
});

test('without a base, the factory setups alone write nothing and give the factory dump', () => {
  const setups = Array.from({ length: 18 }, (_, i) => ({ slot: i + 1, setup: factorySetup(i + 1) }));
  const r = uc4Engine.encode({ setups, message: 'all' }, now);
  assert.ok(r.ok);
  assert.deepEqual(r.written, []);
  assert.deepEqual(r.raw.bytes, load('factory-SndA'));
});

test('without a base only a SndA can be built: a Sndc is no-base', () => {
  const r = uc4Engine.encode({ setups: [{ slot: 16, setup: factorySetup(16) }], message: 'one' }, now);
  assert.ok(!r.ok && r.reason.code === 'no-base');
  assert.match(r.reason.whatToDo, /Sndc/);
});

test('without a base the gate holds: an unconfirmed change is blocked, a slot outside 1–18 is refused', () => {
  const s = factorySetup(3);
  s.encoderGroups[2]!.name = 'orp3'; // name char o: likely
  const r = uc4Engine.encode({ setups: [{ slot: 3, setup: s }], message: 'all' }, now);
  assert.ok(!r.ok && r.reason.code === 'unconfirmed-fields');
  const bad = uc4Engine.encode({ setups: [{ slot: 19, setup: factorySetup(1) }], message: 'all' }, now);
  assert.ok(!bad.ok && bad.reason.code === 'slot-move-unconfirmed');
});

// ---- diff -----------------------------------------------------------------------------------------------------------------

function path(f: FieldId): string {
  if (f.what === 'groupName') return nm(f.group);
  const p = f.property;
  if (f.control === 'encoder') return enc(f.group, f.index, p);
  if (f.control === 'pushButton') return pbt(f.group, f.index, p);
  if (f.control === 'greenButton') return btn(f.group, f.index, p);
  return fad(f.group, f.index, p);
}

for (const p of pairs) {
  test(`diff ${p.prev} → ${p.name}: names exactly the noted fields, all confirmed, slot 16`, () => {
    const d = uc4Engine.diff(message(p.prev), message(p.name));
    assert.ok(d.every((x) => x.slot === 16 && x.field !== null && x.confidence === 'confirmed'), JSON.stringify(d));
    assert.deepEqual([...new Set(d.map((x) => path(x.field!)))].sort(), [...new Set(p.expect.map((e) => e[0]))].sort());
  });
}

test('diff of identical messages is empty', () => {
  assert.deepEqual(uc4Engine.diff(message('base'), message('base')), []);
});

test('diff shows before and after bytes; two changed nibbles of one byte give two entries', () => {
  // enc1-CCr1: type CCAb → CCr1 changes the high nibble of Enc1 +0 (0x20 → 0x00); channel nibble unchanged
  const d = uc4Engine.diff(message('enc1-U126'), message('enc1-CCr1'));
  const type = d.find((x) => x.field?.what === 'control' && x.field.property === 'type')!;
  assert.deepEqual([type.address, type.before, type.after], [0x6700, 0x20, 0x00]);
  assert.equal(d.length, 2); // type and the clamped number
});

test('a byte no field explains has field null; bytes outside the per-setup regions have slot null', () => {
  const a = message('factory-SndA');
  const image = { ...a.image, bytes: a.image.bytes.slice() };
  const push4 = 0x1c00 + 0x500 * 15 + 9 * 64; // push +4 of SE16: low nibble has no field
  image.bytes[push4] = 0x02;
  image.bytes[0x16c0] = 0x00; // filler between the name and the fader 9 regions
  image.bytes[0x1ac0 + 40] = 0x00; // fader 9 table padding of SE16
  const b: DumpMessage = { ...a, image };
  const d = uc4Engine.diff(a, b);
  const at = (addr: number) => d.find((x) => x.address === addr)!;
  assert.deepEqual([at(push4).slot, at(push4).field, at(push4).confidence], [16, null, null]);
  assert.deepEqual([at(0x16c0).slot, at(0x16c0).field], [null, null]);
  assert.deepEqual([at(0x1ac0 + 40).slot, at(0x1ac0 + 40).field], [16, null]);
});

test('diff marks a likely field: the name character o; a fader 9 code and a push button between the ends is confirmed', () => {
  const a = message('base');
  const mod = (address: number, value: number): DumpMessage => {
    const image = { ...a.image, bytes: a.image.bytes.slice() };
    image.bytes[address] = value;
    return { ...a, image };
  };
  const block = 0x1c00 + 0x500 * 15;
  const push = uc4Engine.diff(a, mod(block + 6 * 64 + 1, 5))[0]!; // Pbt c2 number
  assert.equal(push.confidence, 'confirmed'); // order confirmed by combined-se16
  const name = uc4Engine.diff(a, mod(0x1661, 0x17))[0]!; // group 1 char 2 = o
  assert.equal(name.confidence, 'likely');
  assert.equal(uc4Engine.diff(a, mod(0x1661, 0x0a))[0]!.confidence, 'confirmed'); // a: confirmed (names-g1-4)
  const f9 = uc4Engine.diff(a, mod(0x1ac0, 0x2f))[0]!; // fader 9 g1 type Pbnd: confirmed by fad9g1-Pbnd
  assert.equal(f9.confidence, 'confirmed');
  const clean = uc4Engine.diff(a, mod(0x1ac0 + 1, 0x71))[0]!; // fader 9 number
  assert.equal(clean.confidence, 'confirmed');
});

test('diff of a Sndc against a SndA reports the bytes only one of them covers as null', () => {
  const d = uc4Engine.diff(message('factory-SndA'), message('base'));
  assert.ok(d.some((x) => x.after === null && x.before !== null));
  // a block byte only the SndA covers still names its field (position only; there is no second value to weigh)
  const block = 0x1c00 + 0x500 * 2; // SE03 Enc1 +0
  const e = d.find((x) => x.address === block)!;
  assert.deepEqual([e.slot, e.after, e.field?.what === 'control' && e.field.property], [3, null, 'channel']);
  assert.ok(d.some((x) => x.address === block && x.field?.what === 'control' && x.field.property === 'type'));
  assert.ok(d.every((x) => x.after === null || x.before === null || x.before !== x.after));
});

test('diff weighs the code of both values: fader 9 CCAb → Pbnd and CCAb → PrGC are confirmed', () => {
  const a = message('base');
  const mod = (address: number, value: number): DumpMessage => {
    const image = { ...a.image, bytes: a.image.bytes.slice() };
    image.bytes[address] = value;
    return { ...a, image };
  };
  const pbnd = mod(0x1ac0, 0x2f);
  assert.equal(uc4Engine.diff(pbnd, a)[0]!.confidence, 'confirmed');
  assert.equal(uc4Engine.diff(a, pbnd)[0]!.confidence, 'confirmed');
  assert.equal(uc4Engine.diff(a, mod(0x1ac0, 0x1f))[0]!.confidence, 'confirmed');
});

test('diff calls a number above 127 unknown, as decode does', () => {
  const a = message('base');
  const image = { ...a.image, bytes: a.image.bytes.slice() };
  image.bytes[0x6700 + 64] = 0x80;
  assert.equal(uc4Engine.diff(a, { ...a, image })[0]!.confidence, 'unknown');
});
