// The copy clipboard is a 19th slot at the setup-19 addresses (docs/protocol/uc4-sysex.md, copy/paste; `likely`).
// The model has no field for it: decode → encode keeps its bytes, a SndA built without a base writes it empty.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { uc4Engine } from '../../src/protocol/engine.ts';
import { parseFrame, splitMessages, writeFrame } from '../../src/protocol/frame.ts';

const src = { kind: 'file', name: 'x.syx' } as const;
const now = (): string => '2026-11-16T00:00:00.000Z';
const NAMES = 0x16c0, FADER9 = 0x1b80, BLOCK = 0x7600;
const regions: [number, number][] = [[NAMES, 32], [FADER9, 40], [BLOCK, 0x500]];

const filled = new URL('../../dumps/2026-11-16-SndA-after-CPYS-SE01.syx', import.meta.url);
const factory = new URL('../fixtures/sysex/factory-SndA.syx', import.meta.url);

function clipboard(bytes: Uint8Array): number[][] {
  const r = uc4Engine.parse(bytes, src, now);
  assert.ok(r.ok);
  const m = r.messages[0]!;
  return regions.map(([a, n]) => Array.from({ length: n }, (_, k) => m.image.bytes[a + k]!));
}

test('factory SndA: the clipboard is empty (all FF)', () => {
  for (const part of clipboard(new Uint8Array(readFileSync(factory)))) assert.ok(part.every((b) => b === 0xff));
});

test('SndA without a base writes an empty clipboard (known behaviour)', () => {
  const f = uc4Engine.parse(new Uint8Array(readFileSync(factory)), src, now);
  assert.ok(f.ok);
  const d = uc4Engine.decode(f.messages[0]!);
  assert.ok(d.ok);
  const e = uc4Engine.encode({ setups: d.setups.map(({ slot, setup }) => ({ slot, setup })), message: 'all' }, now);
  assert.ok(e.ok);
  for (const part of clipboard(e.raw.bytes)) assert.ok(part.every((b) => b === 0xff));
});

/** The factory SndA with its clipboard filled by CPYS of the scratch setup SE16: the clipboard (slot 19) holds SE16's bytes. */
function filledFromScratch(): Uint8Array {
  const f = parseFrame(splitMessages(new Uint8Array(readFileSync(factory)))[0]!);
  assert.ok(f.ok);
  const at = (a: number): number | undefined => {
    for (const r of f.frame.records) if (a >= r.address && a < r.address + r.data.length) return r.data[a - r.address];
  };
  const copies: [number, number, number][] = [[NAMES, 0x1660, 32], [FADER9, 0x1ac0, 40], [BLOCK, 0x6700, 0x500]];
  const values = new Map<number, number>();
  for (const [to, from, n] of copies) for (let k = 0; k < n; k++) values.set(to + k, at(from + k)!);
  const records = f.frame.records.map((r) => {
    const data = r.data.map((v, k) => values.get(r.address + k) ?? v);
    const sum = data.reduce((a, b) => (a + b) & 0xffff, 0);
    return { ...r, data, sumInDump: sum, sumComputed: sum };
  });
  return writeFrame({ ...f.frame, records });
}

test('SndA with a filled clipboard (scratch SE16 copied into slot 19): decode → encode keeps the clipboard bytes unchanged', () => {
  const bytes = filledFromScratch();
  const before = clipboard(bytes);
  assert.ok(before.every((p) => p.some((b) => b !== 0xff)), 'the clipboard is filled');
  const r = uc4Engine.parse(bytes, src, now);
  assert.ok(r.ok);
  const m = r.messages[0]!;
  assert.deepEqual(m.problems, []);
  const d = uc4Engine.decode(m);
  assert.ok(d.ok);
  const e = uc4Engine.encode({ setups: d.setups.map(({ slot, setup }) => ({ slot, setup })), base: m.raw, message: 'all' }, now);
  assert.ok(e.ok);
  assert.deepEqual(e.raw.bytes, bytes);
  assert.deepEqual(clipboard(e.raw.bytes), before);
});

// Needs dumps/: the filled clipboard in this capture is the user's own SE01 (a real setup, so it is not a fixture); skipped without dumps/.
test.skipIf(!existsSync(filled))('the real capture, SndA with the user\'s SE01 in the clipboard: decode → encode keeps the clipboard bytes unchanged', () => {
  const bytes = new Uint8Array(readFileSync(filled));
  const before = clipboard(bytes);
  assert.ok(before.some((p) => p.some((b) => b !== 0xff)), 'the clipboard is filled');
  const r = uc4Engine.parse(bytes, src, now);
  assert.ok(r.ok);
  const m = r.messages[0]!;
  // it equals SE01 byte for byte (block at 0x1C00)
  assert.deepEqual(before[2], Array.from(m.image.bytes.slice(0x1c00, 0x1c00 + 0x500)));
  const d = uc4Engine.decode(m);
  assert.ok(d.ok);
  const e = uc4Engine.encode({ setups: d.setups.map(({ slot, setup }) => ({ slot, setup })), base: m.raw, message: 'all' }, now);
  assert.ok(e.ok);
  assert.deepEqual(e.raw.bytes, bytes);
  assert.deepEqual(clipboard(e.raw.bytes), before);
});
