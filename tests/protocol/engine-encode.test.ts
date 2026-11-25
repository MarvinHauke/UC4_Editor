// Step 3 of plan 0004: encode with a base. Round trip of every fixture, every fixture pair reproduced byte for byte
// from its predecessor, and the gate (unconfirmed positions and codes, unknown firmware, slot move, invalid values).
import { test } from 'vitest';
import './markOLikely.ts'; // first: marks `o` as likely so the gate has a field to block (see the helper)
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createEngine, uc4Engine, ENGINE_VERSION } from '../../src/protocol/engine.ts';
import { faderfoxUc4 } from '../../src/protocol/profiles/uc4.ts';
import type { DumpMessage, EncodeResult } from '../../src/protocol/types.ts';
import type { Setup } from '../../src/model/types.ts';
import { pairs } from './pairs.ts';

const dir = new URL('../fixtures/sysex/', import.meta.url);
const names = readdirSync(dir).filter((f) => f.endsWith('.syx')).map((f) => f.slice(0, -4));
const load = (n: string): Uint8Array => new Uint8Array(readFileSync(new URL(`${n}.syx`, dir)));
const src = { kind: 'file', name: 'x.syx' } as const;
const now = (): string => '2026-11-15T00:00:00.000Z';
function message(n: string): DumpMessage {
  const r = uc4Engine.parse(load(n), src, now);
  assert.ok(r.ok);
  return r.messages[0]!;
}
function setupOf(n: string, slot = 16): Setup {
  const d = uc4Engine.decode(message(n));
  assert.ok(d.ok);
  return structuredClone(d.setups.find((s) => s.slot === slot)!.setup);
}
/** Sets a value by a path like `encoderGroups[0].encoders[0].channel`. */
function setPath(obj: unknown, path: string, value: unknown): void {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let cur = obj as Record<string, unknown>;
  for (const k of parts.slice(0, -1)) cur = cur[k] as Record<string, unknown>;
  cur[parts[parts.length - 1]!] = value;
}
function encodeFrom(base: string, setup: Setup, slot = 16): EncodeResult {
  return uc4Engine.encode({ setups: [{ slot, setup }], base: message(base).raw, message: 'one' }, now);
}
function blockedOf(r: EncodeResult): string[] {
  assert.ok(!r.ok);
  return r.blocked.map((b) => JSON.stringify(b.field));
}

test('there are fixtures to check', () => assert.ok(names.length >= 70));

// ---- decision 1: decode → encode of every fixture is byte-identical ----------------------------------------------

for (const n of names) {
  test(`${n}: decode then encode is byte-identical and writes nothing`, () => {
    const m = message(n);
    const d = uc4Engine.decode(m);
    assert.ok(d.ok);
    const r = uc4Engine.encode({ setups: d.setups.map(({ slot, setup }) => ({ slot, setup })), base: m.raw, message: m.type }, now);
    assert.ok(r.ok, r.ok ? '' : r.reason.message);
    assert.deepEqual(r.raw.bytes, m.raw.bytes);
    assert.deepEqual(r.written, []);
    assert.deepEqual(r.raw.source, { kind: 'generated' });
    assert.equal(r.raw.engineVersion, ENGINE_VERSION);
    assert.equal(r.raw.capturedAt, '2026-11-15T00:00:00.000Z');
    assert.equal(r.copied.reduce((a, c) => a + c.length, 0), m.image.covered.reduce((a, v) => a + v, 0));
  });
}

// ---- every pair: predecessor + the noted change, encoded, equals the device's dump (sums included) -------------------

for (const p of pairs) {
  test(`${p.name}: ${p.prev} + the noted change encodes to the device's dump, byte for byte`, () => {
    const setup = setupOf(p.prev);
    for (const [path, , after] of p.expect) setPath(setup, path, after);
    const r = encodeFrom(p.prev, setup);
    assert.ok(r.ok, r.ok ? '' : r.reason.message + JSON.stringify(r.ok ? [] : r.blocked));
    assert.deepEqual(r.raw.bytes, load(p.name));
    // one written field per changed value; a changed name counts per changed character
    const want = p.expect.reduce((n, [path, before, after]) => n + (path.endsWith('.name') ? [...String(after)].filter((c, i) => c !== [...String(before)][i]).length : 1), 0);
    assert.equal(r.written.length, want);
  });
}

// ---- the gate --------------------------------------------------------------------------------------------------------

test('a field that is only likely is blocked: the whole encode fails with the list', () => {
  const s = setupOf('base');
  s.encoderGroups[0]!.name = 'orp1';                    // name char o: likely
  s.encoderGroups[2]!.name = 'grpo';                    // o again, at group 3 char 4
  s.encoderGroups[0]!.encoders[0]!.number = 9;          // confirmed: would be written, but the call fails as a whole
  const r = encodeFrom('base', s);
  assert.ok(!r.ok && r.reason.code === 'unconfirmed-fields');
  assert.deepEqual(blockedOf(r).sort(), [
    JSON.stringify({ what: 'groupName', group: 1, char: 1 }),
    JSON.stringify({ what: 'groupName', group: 3, char: 4 }),
  ].sort());
});

test('fader 9 Pbnd, AFtt and bPoL are written (fad9g1-*); a code outside the table is invalid, never written', () => {
  const s = setupOf('base');
  s.faderButtonGroups[0]!.faders[8]!.type = 'Pbnd';
  s.faderButtonGroups[1]!.faders[8]!.type = 'AFtt';
  s.faderButtonGroups[2]!.faders[8]!.display = 'bPoL';
  assert.ok(encodeFrom('base', s).ok);
  const bad = setupOf('base');
  bad.faderButtonGroups[0]!.faders[8]!.type = 'CCr1' as never;
  const r = encodeFrom('base', bad);
  assert.ok(!r.ok && r.reason.code === 'invalid-setup');
});

test('green mode and fader display at the last control and between are written (decision 12, combined-se16); encoder type between the ends too (enc8g8-CCr1)', () => {
  const s = setupOf('base');
  s.faderButtonGroups[7]!.buttons[7]!.mode = 'toGL';
  s.faderButtonGroups[7]!.faders[7]!.display = 'bPoL';
  s.faderButtonGroups[2]!.buttons[4]!.mode = 'toGL';  // between the ends
  s.encoderGroups[2]!.encoders[3]!.type = 'CCr2';
  const r = encodeFrom('base', s);
  assert.ok(r.ok, r.ok ? '' : r.reason.message);
  const img = uc4Engine.parse(r.raw.bytes, src, now);
  assert.ok(img.ok);
  const bytes = img.messages[0]!.image.bytes;
  assert.equal(bytes[SE16_BLOCK + 14 * 64 + 63]! >> 4, 1);        // btn8 g8 mode
  assert.equal(bytes[SE16_BLOCK + 19 * 64 + 63]! & 0x0f, 2);      // FAd8 g8 display bPoL
  assert.equal(bytes[SE16_BLOCK + 14 * 64 + 8 * 2 + 4]! >> 4, 1); // btn5 of group 3: group-major byte 20
  assert.equal(bytes[SE16_BLOCK + 8 * 2 + 3]! >> 4, 1);           // Enc4 of group 3 type CCr2 (code 1)
});

test('push, green and fader are written at their group-major byte (order confirmed by combined-se16)', () => {
  const s = setupOf('base');
  s.encoderGroups[2]!.pushButtons[4]!.number = 99;   // byte 8·2+4 = 20 of push field 1
  s.faderButtonGroups[4]!.buttons[1]!.number = 98;   // byte 8·4+1 = 33 of green field 1
  s.faderButtonGroups[0]!.faders[7]!.number = 97;    // byte 7 of fader field 1
  const r = encodeFrom('base', s);
  assert.ok(r.ok, r.ok ? '' : r.reason.message);
  const out = uc4Engine.parse(r.raw.bytes, src, now);
  assert.ok(out.ok);
  const bytes = out.messages[0]!.image.bytes;
  assert.equal(bytes[SE16_BLOCK + 6 * 64 + 20]!, 99);
  assert.equal(bytes[SE16_BLOCK + 11 * 64 + 33]!, 98);
  assert.equal(bytes[SE16_BLOCK + 16 * 64 + 7]!, 97);
});

test('group names: every position is written, but only confirmed characters (`o` is still likely)', () => {
  const ok = setupOf('base');
  ok.encoderGroups[0]!.name = 'zrp1';       // g1 char 1, z confirmed
  assert.ok(encodeFrom('base', ok).ok);
  const wrongChar = setupOf('base');
  wrongChar.encoderGroups[0]!.name = 'orp1'; // o: likely
  assert.deepEqual(blockedOf(encodeFrom('base', wrongChar)), [JSON.stringify({ what: 'groupName', group: 1, char: 1 })]);
  const anyPos = setupOf('base');
  anyPos.encoderGroups[2]!.name = 'hqst';    // group 3, all four characters confirmed
  assert.ok(encodeFrom('base', anyPos).ok);
});

test('invalid values are reported as invalid-setup with the fields, not blocked and never thrown', () => {
  const s = setupOf('base');
  s.encoderGroups[0]!.encoders[0]!.channel = 17;
  s.encoderGroups[0]!.encoders[0]!.number = 128;
  s.encoderGroups[0]!.encoders[0]!.type = 'nope' as never;
  s.encoderGroups[0]!.name = 'zrp';
  const r = encodeFrom('base', s);
  assert.ok(!r.ok && r.reason.code === 'invalid-setup');
  assert.equal(r.blocked.length, 3 + 4); // three control fields and four name characters
  const broken = { id: 'x', name: 'y', encoderGroups: [], faderButtonGroups: [] } as unknown as Setup;
  const r2 = encodeFrom('base', broken);
  assert.ok(!r2.ok && r2.reason.code === 'invalid-setup');
});

test('a CCAh clamp is not applied silently: the number is written as the model holds it', () => {
  const s = setupOf('enc1-CCr1-n127');
  s.encoderGroups[0]!.encoders[0]!.type = 'CCAh';
  const r = encodeFrom('enc1-CCr1-n127', s);
  assert.ok(r.ok);
  const back = uc4Engine.parse(r.raw.bytes, src, now);
  assert.ok(back.ok);
  const d = uc4Engine.decode(back.messages[0]!);
  assert.ok(d.ok);
  assert.equal(d.setups[0]!.setup.encoderGroups[0]!.encoders[0]!.number, 127);
});

// ---- refusals of the base ------------------------------------------------------------------------------------------

test('no base: no-base', () => {
  const r = uc4Engine.encode({ setups: [{ slot: 16, setup: setupOf('base') }], message: 'one' }, now);
  assert.ok(!r.ok && r.reason.code === 'no-base');
});

test('a base of unknown firmware is refused', () => {
  const bytes = load('base').slice();
  bytes[4 + 9 + 2] = 0x10 | 6;
  const r = uc4Engine.encode({ setups: [{ slot: 16, setup: setupOf('base') }], base: { ...message('base').raw, bytes }, message: 'one' }, now);
  assert.ok(!r.ok && r.reason.code === 'unknown-firmware');
  const eng = createEngine({ ...faderfoxUc4, knownFirmware: ['02.05', '02.06'] });
  assert.ok(eng.encode({ setups: [{ slot: 16, setup: setupOf('base') }], base: { ...message('base').raw, bytes }, message: 'one' }, now).ok);
});

test('a base with a bad checksum, a wrong length or a frame that cannot be written back is refused', () => {
  const good = load('base');
  const flip = good.slice();
  const at = flip.findIndex((v, i) => i > 20 && v === 0x4d);
  flip[at + 2] = 0x10 | ((flip[at + 2]! & 0x0f) ^ 1);
  const stray = Uint8Array.from([...good.subarray(0, 100), 0x45, 0x20, 0x10, ...good.subarray(100)]);
  const short = good.slice(0, good.length - 3 - 3 * 64 - 40);
  const setups = [{ slot: 16, setup: setupOf('base') }];
  const code = (bytes: Uint8Array): string => {
    const r = uc4Engine.encode({ setups, base: { ...message('base').raw, bytes }, message: 'one' }, now);
    return r.ok ? 'ok' : r.reason.code;
  };
  assert.equal(code(flip), 'bad-checksum');
  assert.equal(code(stray), 'not-lossless');
  assert.notEqual(code(Uint8Array.from([...short.subarray(0, short.length - 1), 0xf7])), 'ok');
});

test('a message type other than the base\'s is not rebuilt: base-mismatch', () => {
  const r = uc4Engine.encode({ setups: [{ slot: 16, setup: setupOf('base') }], base: message('base').raw, message: 'all' }, now);
  assert.ok(!r.ok && r.reason.code === 'base-mismatch');
});

test('a slot the base does not contain is a slot move: refused', () => {
  const r = encodeFrom('base', setupOf('base'), 3);
  assert.ok(!r.ok && r.reason.code === 'slot-move-unconfirmed');
});

test('a Sndc needs exactly one setup; the same slot twice is refused', () => {
  const s = setupOf('base');
  const a = uc4Engine.encode({ setups: [], base: message('base').raw, message: 'one' }, now);
  assert.ok(!a.ok && a.reason.code === 'invalid-setup');
  const b = uc4Engine.encode({ setups: [{ slot: 16, setup: s }, { slot: 16, setup: s }], base: message('base').raw, message: 'one' }, now);
  assert.ok(!b.ok && b.reason.code === 'invalid-setup');
});

// ---- SndA -----------------------------------------------------------------------------------------------------------

test('SndA: one setup changed, the other 17 slots are copied unchanged, sums recomputed', () => {
  const m = message('factory-SndA');
  const d = uc4Engine.decode(m);
  assert.ok(d.ok);
  const setups = d.setups.map(({ slot, setup }) => ({ slot, setup: structuredClone(setup) }));
  setups[4]!.setup.encoderGroups[0]!.encoders[0]!.number = 99; // SE05
  setups[16]!.setup.encoderGroups[0]!.name = 'zNd1'.toLowerCase(); // SE17 g1 char 1 'z'
  const r = uc4Engine.encode({ setups, base: m.raw, message: 'all' }, now);
  assert.ok(r.ok, r.ok ? '' : r.reason.message);
  assert.equal(r.written.length, 2);
  const back = uc4Engine.parse(r.raw.bytes, src, now);
  assert.ok(back.ok);
  assert.deepEqual(back.messages[0]!.problems, []);
  const d2 = uc4Engine.decode(back.messages[0]!);
  assert.ok(d2.ok);
  assert.equal(d2.setups[4]!.setup.encoderGroups[0]!.encoders[0]!.number, 99);
  assert.equal(d2.setups[16]!.setup.encoderGroups[0]!.name, 'znd1');
  for (const i of [0, 1, 2, 3, 5, 10, 17]) assert.deepEqual(d2.setups[i]!.setup, d.setups[i]!.setup);
  // every byte outside the two changed ones equals the base
  let diff = 0;
  for (let k = 0; k < m.raw.bytes.length; k++) if (m.raw.bytes[k] !== r.raw.bytes[k]) diff++;
  assert.ok(diff > 0 && diff < 20); // two data bytes' tokens plus the two sum tokens each
});

test('encode does not change the base dump it was given', () => {
  const m = message('base');
  const before = m.raw.bytes.slice();
  const s = setupOf('base');
  s.encoderGroups[0]!.encoders[0]!.number = 3;
  uc4Engine.encode({ setups: [{ slot: 16, setup: s }], base: m.raw, message: 'one' }, now);
  assert.deepEqual(m.raw.bytes, before);
});

test('the same request twice gives the same bytes (deterministic)', () => {
  const s = setupOf('base');
  s.encoderGroups[0]!.encoders[0]!.number = 3;
  const a = encodeFrom('base', s), b = encodeFrom('base', s);
  assert.ok(a.ok && b.ok);
  assert.deepEqual(a.raw, b.raw);
});

test('a base whose records conflict is refused like any lossy frame', async () => {
  const { parseFrame, writeFrame, splitMessages } = await import('../../src/protocol/frame.ts');
  const f = parseFrame(splitMessages(load('base'))[0]!);
  assert.ok(f.ok);
  const dup = { ...f.frame.records[2]!, data: f.frame.records[2]!.data.slice() };
  dup.data[0] = dup.data[0]! ^ 1;
  dup.sumInDump = dup.data.reduce((a, b) => a + b, 0) & 0xffff;
  const bytes = writeFrame({ ...f.frame, records: [...f.frame.records, dup] });
  const r = uc4Engine.encode({ setups: [{ slot: 16, setup: setupOf('base') }], base: { ...message('base').raw, bytes }, message: 'one' }, now);
  assert.ok(!r.ok && r.reason.code === 'not-lossless');
});

// ---- bytes the model cannot hold ------------------------------------------------------------------------------------

/** `base` with some image data bytes edited in the dump itself (tokens and record sums fixed): parse gives no problems. */
async function editedBase(edits: Array<[number, number]>): Promise<Uint8Array> {
  const { parseFrame, writeFrame, splitMessages } = await import('../../src/protocol/frame.ts');
  const f = parseFrame(splitMessages(load('base'))[0]!);
  assert.ok(f.ok);
  const records = f.frame.records.map((r) => ({ ...r, data: r.data.slice() }));
  for (const [address, value] of edits) {
    const r = records.find((x) => address >= x.address && address < x.address + x.data.length)!;
    r.data[address - r.address] = value;
    r.sumInDump = r.data.reduce((a, b) => a + b, 0) & 0xffff;
  }
  return writeFrame({ ...f.frame, records });
}
const SE16_BLOCK = 0x1c00 + 0x500 * 15;

test('patching a nibble keeps the other nibble of its byte (push +4 low nibble survives a mode change)', async () => {
  const bytes = await editedBase([[SE16_BLOCK + 9 * 64, 0x02]]); // Pbt1 +4: mode btn, low nibble 2 (not in the model)
  const raw = { ...message('base').raw, bytes };
  const s = setupOf('base');
  s.encoderGroups[0]!.pushButtons[0]!.mode = 'toGL';
  const r = uc4Engine.encode({ setups: [{ slot: 16, setup: s }], base: raw, message: 'one' }, now);
  assert.ok(r.ok, r.ok ? '' : r.reason.message);
  const out = uc4Engine.parse(r.raw.bytes, src, now);
  assert.ok(out.ok);
  assert.equal(out.messages[0]!.image.bytes[SE16_BLOCK + 9 * 64], 0x12);
});

test('a field unreadable in the base: unchanged keeps the raw byte; another value is written or blocked as usual', async () => {
  const bytes = await editedBase([[SE16_BLOCK, 0x7f]]); // Enc1 type code 7 does not exist; channel 16
  const raw = { ...message('base').raw, bytes };
  const d = uc4Engine.decode(uc4Engine.parse(bytes, src, now).ok ? (uc4Engine.parse(bytes, src, now) as { ok: true; messages: DumpMessage[] }).messages[0]! : message('base'));
  assert.ok(d.ok);
  assert.equal(d.setups[0]!.unreadable.length, 1);
  const same = structuredClone(d.setups[0]!.setup);
  const a = uc4Engine.encode({ setups: [{ slot: 16, setup: same }], base: raw, message: 'one' }, now);
  assert.ok(a.ok);
  assert.deepEqual(a.raw.bytes, bytes); // (a) the unknown byte survives
  const other = structuredClone(same);
  other.encoderGroups[0]!.encoders[0]!.type = 'CCr2';
  const b = uc4Engine.encode({ setups: [{ slot: 16, setup: other }], base: raw, message: 'one' }, now);
  assert.ok(b.ok); // (b) g1c1 type is confirmed
  const out = uc4Engine.parse(b.raw.bytes, src, now);
  assert.ok(out.ok);
  assert.equal(out.messages[0]!.image.bytes[SE16_BLOCK], 0x1f);
  const blockedCase = structuredClone(same);
  blockedCase.encoderGroups[0]!.name = 'orp1'; // name char o: likely
  assert.ok(!uc4Engine.encode({ setups: [{ slot: 16, setup: blockedCase }], base: raw, message: 'one' }, now).ok);
});

test('a setup meant for another slot than the one it is written to is refused', () => {
  const s = setupOf('base');
  s.slot = 3;
  const r = uc4Engine.encode({ setups: [{ slot: 16, setup: s }], base: message('base').raw, message: 'one' }, now);
  assert.ok(!r.ok && r.reason.code === 'slot-move-unconfirmed');
  assert.match(r.reason.message, /slot 3.*slot 16/);
  const noSlot = setupOf('base');
  delete noSlot.slot;
  assert.ok(uc4Engine.encode({ setups: [{ slot: 16, setup: noSlot }], base: message('base').raw, message: 'one' }, now).ok);
});
