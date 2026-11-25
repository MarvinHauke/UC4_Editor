// Step 1 of plan 0004: framing + parse over every fixture, plus the refusal cases.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createEngine, uc4Engine, ENGINE_VERSION } from '../../src/protocol/engine.ts';
import { faderfoxUc4 } from '../../src/protocol/profiles/uc4.ts';
import { splitMessages } from '../../src/protocol/frame.ts';

const dir = new URL('../fixtures/sysex/', import.meta.url);
const names = readdirSync(dir).filter((f) => f.endsWith('.syx')).map((f) => f.slice(0, -4));
const load = (n: string): Uint8Array => new Uint8Array(readFileSync(new URL(`${n}.syx`, dir)));
const src = { kind: 'file', name: 'x.syx' } as const;
const now = (): string => '2026-11-15T00:00:00.000Z';

test('there are fixtures to check', () => assert.ok(names.length >= 70));

for (const n of names) {
  test(`${n}: parses with no problems, bytes kept, firmware 02.05`, () => {
    const bytes = load(n);
    const r = uc4Engine.parse(bytes, src, now);
    assert.ok(r.ok);
    assert.equal(r.ignoredBytes, 0);
    assert.equal(r.messages.length, 1);
    const m = r.messages[0]!;
    assert.deepEqual(m.problems, []);
    assert.deepEqual(m.raw.bytes, bytes);
    assert.equal(m.raw.engineVersion, ENGINE_VERSION);
    assert.equal(m.raw.capturedAt, '2026-11-15T00:00:00.000Z');
    assert.equal(m.firmware, '02.05');
    assert.ok(m.frame.records.every((x) => x.sumOk));
    if (n === 'factory-SndA') {
      assert.equal(m.type, 'all');
      assert.deepEqual(m.slots, Array.from({ length: 18 }, (_, i) => i + 1));
    } else {
      assert.equal(m.type, 'one');
      assert.equal(m.slots.length, 1);
    }
  });
}

test('SE16 fixtures carry slot 16 in their addresses', () => {
  const r = uc4Engine.parse(load('base'), src, now);
  assert.ok(r.ok);
  assert.deepEqual(r.messages[0]!.slots, [16]);
});

test('raw bytes are a copy: changing the input afterwards does not change the dump', () => {
  const bytes = load('base');
  const r = uc4Engine.parse(bytes, src, now);
  assert.ok(r.ok);
  bytes[10] = 0;
  assert.notEqual(r.messages[0]!.raw.bytes[10], 0);
});

test('several messages in one file: all are returned', () => {
  const a = load('base'), b = load('enc1-ch01');
  const both = Uint8Array.from([...a, ...b]);
  const r = uc4Engine.parse(both, src, now);
  assert.ok(r.ok);
  assert.equal(r.messages.length, 2);
  assert.equal(r.ignoredBytes, 0);
  assert.deepEqual(r.messages[1]!.raw.bytes, b);
});

test('bytes between messages are counted as ignored', () => {
  const a = load('base');
  const r = uc4Engine.parse(Uint8Array.from([0xfe, 0xfe, ...a, 0x00]), src, now);
  assert.ok(r.ok);
  assert.equal(r.ignoredBytes, 3);
});

test('not SysEx / empty / wrong manufacturer are results with a reason', () => {
  const e1 = uc4Engine.parse(new Uint8Array([1, 2, 3]), src, now);
  assert.ok(!e1.ok && e1.reason.code === 'not-sysex' && e1.reason.whatToDo.length > 0);
  const e2 = uc4Engine.parse(new Uint8Array(0), src, now);
  assert.ok(!e2.ok && e2.reason.code === 'not-sysex');
  const bad = load('base').slice();
  bad[1] = 0x7d;
  const e3 = uc4Engine.parse(bad, src, now);
  assert.ok(!e3.ok && e3.reason.code === 'wrong-manufacturer');
});

test('an unreadable token and a missing header are results, not throws', () => {
  const bad = load('base').slice();
  bad[5] = 0x55;
  const e = uc4Engine.parse(bad, src, now);
  assert.ok(!e.ok && e.reason.code === 'unreadable-token');
  const short = Uint8Array.from([0xf0, 0, 0, 0, 0x41, 0x20, 0x16, 0xf7]);
  const e2 = uc4Engine.parse(short, src, now);
  assert.ok(!e2.ok && e2.reason.code === 'incomplete-message');
});

test('a changed data byte: message is returned with a bad-checksum problem', () => {
  const bytes = load('base').slice();
  const m0 = splitMessages(bytes)[0]!;
  // first data token (cmd D) of the first record; flip its low nibble
  const at = m0.findIndex((v, i) => v === 0x4d && i > 20);
  bytes[at + 2] = 0x10 | ((bytes[at + 2]! & 0x0f) ^ 1);
  const r = uc4Engine.parse(bytes, src, now);
  assert.ok(r.ok);
  assert.deepEqual(r.messages[0]!.problems.map((p) => p.code), ['bad-checksum']);
});

test('a message of the wrong length (one record missing) has a wrong-length problem', () => {
  const bytes = load('base');
  // cut the last record (3 + 64*3 + ... ) by dropping everything from the last cmd-9 token up to the trailer
  const idx = bytes.lastIndexOf(0x49);
  const trailer = bytes.length - 4; // F tokens (3) + F7
  const cut = Uint8Array.from([...bytes.subarray(0, idx), ...bytes.subarray(trailer)]);
  const r = uc4Engine.parse(cut, src, now);
  assert.ok(r.ok);
  assert.ok(r.messages[0]!.problems.some((p) => p.code === 'wrong-length'));
});

test('an unknown message type (header command 2) is refused with a reason', () => {
  const bytes = load('base').slice();
  // header: F0 00 00 00 | 41 20 16 | 42 20 12 (cmd2 = 02) ...
  assert.equal(bytes[4 + 3], 0x42);
  bytes[4 + 3 + 2] = 0x10 | 7;
  const r = uc4Engine.parse(bytes, src, now);
  assert.ok(!r.ok && r.reason.code === 'unknown-message-type');
});

test('unknown firmware only warns: the message is still returned', () => {
  const bytes = load('base').slice();
  assert.equal(bytes[4 + 9], 0x44);
  bytes[4 + 9 + 2] = 0x10 | 6; // 02.06
  const r = uc4Engine.parse(bytes, src, now);
  assert.ok(r.ok);
  assert.equal(r.messages[0]!.firmware, '02.06');
  assert.deepEqual(r.messages[0]!.problems.map((p) => p.code), ['unknown-firmware']);
});

test('createEngine(profile) uses the profile: a profile that knows 02.06 has no firmware problem', () => {
  const bytes = load('base').slice();
  bytes[4 + 9 + 2] = 0x10 | 6;
  const eng = createEngine({ ...faderfoxUc4, knownFirmware: ['02.05', '02.06'] });
  const r = eng.parse(bytes, src, now);
  assert.ok(r.ok);
  assert.deepEqual(r.messages[0]!.problems, []);
});

test('default `now` gives an ISO timestamp', () => {
  const r = uc4Engine.parse(load('base'), src);
  assert.ok(r.ok);
  assert.match(r.messages[0]!.raw.capturedAt, /^\d{4}-\d\d-\d\dT/);
});

test('an extra 00 in record padding is kept and still written back (lossless)', () => {
  const b = load('base');
  const at = b.findIndex((v, i) => i > 20 && v === 0x4c) + 3; // first sum-low token, then padding
  const bad = Uint8Array.from([...b.subarray(0, at), 0, ...b.subarray(at)]);
  const r = uc4Engine.parse(bad, src, now);
  assert.ok(r.ok);
  assert.equal(r.messages[0]!.frame.lossless, true); // padding is counted per record: still written back
});

test('an unknown command token makes the frame non-lossless: a problem, bytes kept', () => {
  const b = load('base');
  const at = b.findIndex((v, i) => i > 20 && v === 0x4c) + 3;
  const bad = Uint8Array.from([...b.subarray(0, at), 0x45, 0x20, 0x10, ...b.subarray(at)]);
  const r = uc4Engine.parse(bad, src, now);
  assert.ok(r.ok);
  assert.equal(r.messages[0]!.frame.lossless, false);
  assert.ok(r.messages[0]!.problems.some((p) => p.code === 'not-lossless'));
  assert.deepEqual(r.messages[0]!.raw.bytes, bad);
});

test('a valid message followed by an unreadable one: ok, one message, the second listed in skipped and counted as ignored', () => {
  const a = load('base');
  const junk = Uint8Array.from([0xf0, 0x00, 0x00, 0x00, 0x55, 0x55, 0x55, 0xf7]);
  const r = uc4Engine.parse(Uint8Array.from([...a, ...junk]), src, now);
  assert.ok(r.ok);
  assert.equal(r.messages.length, 1);
  assert.equal(r.ignoredBytes, junk.length);
  assert.equal(r.skipped.length, 1);
  assert.equal(r.skipped[0]!.index, 1);
  assert.equal(r.skipped[0]!.reason.code, 'unreadable-token');
});

test('right length and record count but a wrong slot set gives a wrong-length problem that names the slots', () => {
  const eng = createEngine({ ...faderfoxUc4, framing: { ...faderfoxUc4.framing, slotsPerMessage: { all: 18, one: 2 } } });
  const r = eng.parse(load('base'), src, now);
  assert.ok(r.ok);
  const p = r.messages[0]!.problems;
  assert.deepEqual(p.map((x) => x.code), ['wrong-length']);
  assert.match(p[0]!.message, /covers 2 setup\(s\); this one covers 1 \(slots 16\)/);
});

test('a later message of unknown type is skipped with its reason; the first of unknown type refuses', () => {
  const a = load('base');
  const odd = load('base').slice();
  odd[4 + 3 + 2] = 0x17;
  const r = uc4Engine.parse(Uint8Array.from([...a, ...odd]), src, now);
  assert.ok(r.ok);
  assert.equal(r.messages.length, 1);
  assert.deepEqual(r.skipped.map((x) => [x.index, x.reason.code]), [[1, 'unknown-message-type']]);
  assert.equal(r.ignoredBytes, odd.length);
  const first = uc4Engine.parse(Uint8Array.from([...odd, ...a]), src, now);
  assert.ok(!first.ok && first.reason.code === 'unknown-message-type');
});

test('a clean file has no skipped messages', () => {
  const r = uc4Engine.parse(load('base'), src, now);
  assert.ok(r.ok);
  assert.deepEqual(r.skipped, []);
});
