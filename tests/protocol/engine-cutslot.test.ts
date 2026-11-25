// Plan 0005 step 13b (decision 30): `cutSlot` makes the Sndc a UC4 would send for one slot out of a SndA.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { uc4Engine } from '../../src/protocol/engine.ts';
import type { RawDump } from '../../src/protocol/types.ts';
import { parseFrame, splitMessages, writeFrame } from '../../src/protocol/frame.ts';

const src = { kind: 'file', name: 'x.syx' } as const;
const now = (): string => '2026-11-18T00:00:00.000Z';
const FX = 'tests/fixtures/sysex/';
const FACTORY = `${FX}factory-SndA.syx`;
const load = (path: string): Uint8Array => new Uint8Array(readFileSync(new URL(`../../${path}`, import.meta.url)));
const raw = (bytes: Uint8Array): RawDump => ({ bytes, source: src, capturedAt: now(), engineVersion: '0' });
const same = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

function cut(sndA: string, slot: number): Uint8Array {
  const r = uc4Engine.cutSlot(raw(load(sndA)), slot, now);
  assert.ok(r.ok, r.ok ? '' : r.reason.message);
  return r.raw.bytes;
}

test('SE16 cut from the SndA equals the Sndc the UC4 sent (byte for byte)', () => {
  assert.deepEqual(cut(FACTORY, 16), load(`${FX}base.syx`));
});

test('the cut is a generated, clean Sndc of that slot', () => {
  const r = uc4Engine.cutSlot(raw(load(FACTORY)), 16, now);
  assert.ok(r.ok);
  assert.deepEqual(r.raw.source, { kind: 'generated' });
  const p = uc4Engine.parse(r.raw.bytes, src, now);
  assert.ok(p.ok);
  assert.equal(p.messages[0]!.type, 'one');
  assert.deepEqual(p.messages[0]!.slots, [16]);
  assert.deepEqual(p.messages[0]!.problems, []);
});

// Other slots: the factory Sndc of SE09, SE17 and SE18 (fixtures) equal their slot cut from the factory SndA.
for (const slot of [9, 17, 18]) {
  const n = String(slot).padStart(2, '0');
  test(`factory-Sndc-SE${n} equals slot ${slot} cut from factory-SndA`, () => {
    assert.ok(same(cut(FACTORY, slot), load(`${FX}factory-Sndc-SE${n}.syx`)));
  });
}

// SE01 and SE02 hold the user's own setups: these need the real backup in dumps/ (not part of a public checkout).
const REAL = 'dumps/2026-11-13-SndA-before-rESA.syx';
describe.skipIf(!existsSync(new URL(`../../${REAL}`, import.meta.url)))('the user\'s own setups SE01 and SE02 (need dumps/)', () => {
  for (const [c, slot] of [['2026-11-13-Sndc-SE01', 1], ['2026-11-13-Sndc-SE02', 2]] as const) {
    test(`${c.slice(11)} equals slot ${slot} cut from the backup`, () => {
      assert.ok(same(cut(REAL, slot), load(`dumps/${c}.syx`)));
    });
  }
});

test('factory SndA, SE16, group 1 name "send" encoded on the cut equals the device\'s send2 Sndc', () => {
  const sndA = raw(load(FACTORY));
  const c = uc4Engine.cutSlot(sndA, 16, now);
  assert.ok(c.ok);
  const parsed = uc4Engine.parse(c.raw.bytes, src, now);
  assert.ok(parsed.ok);
  const d = uc4Engine.decode(parsed.messages[0]!);
  assert.ok(d.ok);
  const setup = structuredClone(d.setups[0]!.setup);
  setup.encoderGroups[0]!.name = 'send';
  const e = uc4Engine.encode({ message: 'one', base: c.raw, setups: [{ slot: 16, setup }] }, now);
  assert.ok(e.ok, e.ok ? '' : e.reason.message);
  assert.deepEqual(e.raw.bytes, load(`${FX}sndc-se16-g1-send.syx`));
});

test('refusals are results with a reason', () => {
  const sndA = raw(load(FACTORY));
  for (const slot of [0, 19, -1, 1.5, NaN]) {
    const r = uc4Engine.cutSlot(sndA, slot, now);
    assert.ok(!r.ok && r.reason.code === 'invalid-setup', `slot ${slot}`);
  }
  const sndc = uc4Engine.cutSlot(raw(load(`${FX}base.syx`)), 16, now);
  assert.ok(!sndc.ok && sndc.reason.code === 'base-mismatch');
  const junk = uc4Engine.cutSlot(raw(Uint8Array.from([1, 2, 3])), 1, now);
  assert.ok(!junk.ok);
  const f = parseFrame(splitMessages(sndA.bytes)[0]!);
  assert.ok(f.ok);
  const damaged = writeFrame({ ...f.frame, records: f.frame.records.map((r, i) => (i === 3 ? { ...r, sumInDump: r.sumInDump ^ 1 } : r)) });
  const bad = uc4Engine.cutSlot(raw(damaged), 1, now);
  assert.ok(!bad.ok && bad.reason.code === 'bad-checksum');
  // a SndA missing one of the slot's records: parse refuses it before the coverage check (that check stays as a guard)
  const short = writeFrame({ ...f.frame, records: f.frame.records.filter((r) => r.address !== 0x1c00 + 0x500 * 4) });
  const gap = uc4Engine.cutSlot(raw(short), 5, now);
  assert.ok(!gap.ok && gap.reason.code === 'wrong-length');
});
