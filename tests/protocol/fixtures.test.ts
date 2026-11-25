// Fixture tests: real dumps from tests/fixtures/sysex/ (each has a .json note).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFrame, splitMessages, writeFrame } from '../../src/protocol/frame.ts';
import { buildImage, diffImages } from '../../src/protocol/image.ts';

const load = (name: string): Uint8Array => new Uint8Array(readFileSync(new URL(`../fixtures/sysex/${name}.syx`, import.meta.url)));

test('base (SE16 after rESc): parses, sums ok, round trip byte-identical and lossless', () => {
  const bytes = load('base');
  const msgs = splitMessages(bytes);
  assert.equal(msgs.length, 1);
  const r = parseFrame(msgs[0]!);
  assert.ok(r.ok && r.frame.lossless);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.frame.header, [6, 2, 2, 5]);
  assert.equal(r.frame.records.length, 22);
  assert.ok(r.frame.records.every((x) => x.sumOk));
  assert.deepEqual(writeFrame(r.frame), bytes);
});

test('base: the slot is carried by the addresses (SE16), and spot-checks factory values (likely layout)', () => {
  const r = parseFrame(load('base'));
  assert.ok(r.ok);
  const img = buildImage([r.frame]);
  const s = 16, ch = s - 1;
  const names = 0x1480 + 32 * (s - 1), tbl = 0x1700 + 64 * (s - 1), blk = 0x1c00 + 0x500 * (s - 1);
  assert.ok(img.covered[names] && img.covered[tbl] && img.covered[blk] && img.covered[blk + 0x4ff]);
  assert.equal(img.covered.reduce((n, v) => n + v, 0), 32 + 64 + 1280);
  assert.deepEqual(Array.from(img.bytes.subarray(names, names + 4)), [0x10, 0x1a, 0x18, 0x01]); // GrP1
  assert.deepEqual(Array.from(img.bytes.subarray(tbl, tbl + 5)), [ch, 0x70, 0, 0x7f, 1]); // fader 9, group 1
  assert.equal(img.bytes[blk], 0x20 | ch); // Enc1 G1: type CCAb, channel 16
  assert.equal(img.bytes[blk + 1 * 64], 8); // Enc1 G1 number
  assert.equal(img.bytes[blk + 4 * 64], 0x31); // Acc3 + Std
});

// Session 1, batches 1–9: each fixture differs from its predecessor by exactly one byte, except the number clamp (enc1-CCr1, enc1-CCAh-clamp: two bytes) and the combined dumps (one byte per control) (docs/protocol/uc4-sysex.md).
const SE16_BLOCK = 0x1c00 + 0x500 * 15;
type Step = { name: string; prev: string; address: number; before: number; after: number; also?: { address: number; before: number; after: number }[] };
const chain: Step[] = [
  { name: 'enc1-ch01', prev: 'base', address: SE16_BLOCK + 0 * 64, before: 0x2f, after: 0x20 },
  { name: 'enc1-n009', prev: 'enc1-ch01', address: SE16_BLOCK + 1 * 64, before: 0x08, after: 0x09 },
  { name: 'enc1-n127', prev: 'enc1-n009', address: SE16_BLOCK + 1 * 64, before: 0x09, after: 0x7f },
  { name: 'enc1-L001', prev: 'enc1-n127', address: SE16_BLOCK + 2 * 64, before: 0x00, after: 0x01 },
  { name: 'enc1-U126', prev: 'enc1-L001', address: SE16_BLOCK + 3 * 64, before: 0x7f, after: 0x7e },
  // Batch 2: command type = high nibble of field 0 (CCr1 0, CCr2 1, CCAb 2, CCAh 4, Pbnd 5, AFtt 6).
  // CCr1 also moved the number 7F -> 1F (finding: clamp on the way through CCAh, not a rule).
  { name: 'enc1-CCr1', prev: 'enc1-U126', address: SE16_BLOCK, before: 0x20, after: 0x00, also: [{ address: SE16_BLOCK + 64, before: 0x7f, after: 0x1f }] },
  { name: 'enc1-CCr2', prev: 'enc1-CCr1', address: SE16_BLOCK, before: 0x00, after: 0x10 },
  { name: 'enc1-CCAh', prev: 'enc1-CCr2', address: SE16_BLOCK, before: 0x10, after: 0x40 },
  { name: 'enc1-Pbnd', prev: 'enc1-CCAh', address: SE16_BLOCK, before: 0x40, after: 0x50 },
  { name: 'enc1-AFtt', prev: 'enc1-Pbnd', address: SE16_BLOCK, before: 0x50, after: 0x60 },
  { name: 'enc1-CCAb-n031', prev: 'enc1-AFtt', address: SE16_BLOCK, before: 0x60, after: 0x20 },
  // Batch 3a: field 4 = (mode << 4) | display scale: Acc0..Acc3 = 0..3; OFF 0, Std 1, bPoL 2.
  { name: 'enc1-Acc0', prev: 'enc1-CCAb-n031', address: SE16_BLOCK + 4 * 64, before: 0x31, after: 0x01 },
  { name: 'enc1-Acc1', prev: 'enc1-Acc0', address: SE16_BLOCK + 4 * 64, before: 0x01, after: 0x11 },
  { name: 'enc1-Acc2', prev: 'enc1-Acc1', address: SE16_BLOCK + 4 * 64, before: 0x11, after: 0x21 },
  { name: 'enc1-dispOFF', prev: 'enc1-Acc2', address: SE16_BLOCK + 4 * 64, before: 0x21, after: 0x20 },
  { name: 'enc1-bPoL', prev: 'enc1-dispOFF', address: SE16_BLOCK + 4 * 64, before: 0x20, after: 0x22 },
  // Batch 3b: stride pair (Enc8, group 8: byte 63 of the number field), PrGC = 3, and the clamp check:
  // CCr2 and CCr1 keep n127 (so they do not limit the number).
  { name: 'enc8g8-n104', prev: 'enc1-bPoL', address: SE16_BLOCK + 64 + 63, before: 0x67, after: 0x68 },
  { name: 'enc1-PrGC', prev: 'enc8g8-n104', address: SE16_BLOCK, before: 0x20, after: 0x30 },
  { name: 'enc1-PrGC-back-CCAb', prev: 'enc1-PrGC', address: SE16_BLOCK, before: 0x30, after: 0x20 },
  { name: 'enc1-CCAb-n127', prev: 'enc1-PrGC-back-CCAb', address: SE16_BLOCK + 64, before: 0x1f, after: 0x7f },
  { name: 'enc1-CCr2-n127', prev: 'enc1-CCAb-n127', address: SE16_BLOCK, before: 0x20, after: 0x10 },
  { name: 'enc1-CCr1-n127', prev: 'enc1-CCr2-n127', address: SE16_BLOCK, before: 0x10, after: 0x00 },
  // Batch 4: CCAh lowers the number to 31 (device behaviour); then channel/number/lower/upper of the first
  // push button, green button and fader (3 controls per dump), then the last controls of group 8.
  { name: 'enc1-CCAh-clamp', prev: 'enc1-CCr1-n127', address: SE16_BLOCK, before: 0x00, after: 0x40, also: [{ address: SE16_BLOCK + 64, before: 0x7f, after: 0x1f }] },
  { name: 'pbf1-ch01', prev: 'enc1-CCAh-clamp', address: SE16_BLOCK + 5 * 64, before: 0x1f, after: 0x10, also: [{ address: SE16_BLOCK + 10 * 64, before: 0x1f, after: 0x10 }, { address: SE16_BLOCK + 15 * 64, before: 0x0f, after: 0x00 }] },
  { name: 'pbf1-number', prev: 'pbf1-ch01', address: SE16_BLOCK + 6 * 64, before: 0x00, after: 0x7f, also: [{ address: SE16_BLOCK + 11 * 64, before: 0x40, after: 0x41 }, { address: SE16_BLOCK + 16 * 64, before: 0x20, after: 0x21 }] },
  { name: 'pbf1-lower', prev: 'pbf1-number', address: SE16_BLOCK + 7 * 64, before: 0x00, after: 0x01, also: [{ address: SE16_BLOCK + 12 * 64, before: 0x00, after: 0x01 }, { address: SE16_BLOCK + 17 * 64, before: 0x00, after: 0x01 }] },
  { name: 'pbf1-upper', prev: 'pbf1-lower', address: SE16_BLOCK + 8 * 64, before: 0x7f, after: 0x7e, also: [{ address: SE16_BLOCK + 13 * 64, before: 0x7f, after: 0x7e }, { address: SE16_BLOCK + 18 * 64, before: 0x7f, after: 0x7e }] },
  { name: 'pbf8-stride', prev: 'pbf1-upper', address: SE16_BLOCK + 6 * 64 + 63, before: 0x3f, after: 0x40, also: [{ address: SE16_BLOCK + 12 * 64 + 63, before: 0x00, after: 0x01 }, { address: SE16_BLOCK + 18 * 64 + 63, before: 0x7f, after: 0x7e }] },
  // Batch 4b: the other encoder fields at the last controls, group-major order (control-major would hit 55/47).
  { name: 'enc876g8-stride', prev: 'pbf8-stride', address: SE16_BLOCK + 63, before: 0x2f, after: 0x20, also: [{ address: SE16_BLOCK + 2 * 64 + 62, before: 0x00, after: 0x01 }, { address: SE16_BLOCK + 3 * 64 + 61, before: 0x7f, after: 0x7e }] },
  { name: 'enc8g8-Acc0', prev: 'enc876g8-stride', address: SE16_BLOCK + 4 * 64 + 63, before: 0x31, after: 0x01 },
  { name: 'enc8g8-dispOFF', prev: 'enc8g8-Acc0', address: SE16_BLOCK + 4 * 64 + 63, before: 0x01, after: 0x00 },
  // Batch 5: push-button and green-button type codes (OFF 0, notE 1, CC 2, PrGC 3, AFtt 4) and button mode toGL.
  { name: 'pbt1-OFF', prev: 'enc8g8-dispOFF', address: SE16_BLOCK + 5 * 64, before: 0x10, after: 0x00 },
  { name: 'pbt1-CC', prev: 'pbt1-OFF', address: SE16_BLOCK + 5 * 64, before: 0x00, after: 0x20 },
  { name: 'pbt1-PrGC', prev: 'pbt1-CC', address: SE16_BLOCK + 5 * 64, before: 0x20, after: 0x30 },
  { name: 'pbt1-AFtt', prev: 'pbt1-PrGC', address: SE16_BLOCK + 5 * 64, before: 0x30, after: 0x40 },
  { name: 'btn1-CC', prev: 'pbt1-AFtt', address: SE16_BLOCK + 10 * 64, before: 0x10, after: 0x20 },
  { name: 'btn1-toGL', prev: 'btn1-CC', address: SE16_BLOCK + 14 * 64, before: 0x01, after: 0x11 },
  // Batch 6: green button display (OFF 0, Std 1, EXt 2), push toGL, fader SnAP, fader type (CCAb 0, PrGC 1, Pbnd 2).
  { name: 'btn1-dispOFF', prev: 'btn1-toGL', address: SE16_BLOCK + 14 * 64, before: 0x11, after: 0x10 },
  { name: 'btn1-EXt', prev: 'btn1-dispOFF', address: SE16_BLOCK + 14 * 64, before: 0x10, after: 0x12 },
  { name: 'pbt1-toGL', prev: 'btn1-EXt', address: SE16_BLOCK + 9 * 64, before: 0x00, after: 0x10 },
  { name: 'fad1-SnAP', prev: 'pbt1-toGL', address: SE16_BLOCK + 19 * 64, before: 0x01, after: 0x11 },
  { name: 'fad1-PrGC', prev: 'fad1-SnAP', address: SE16_BLOCK + 15 * 64, before: 0x00, after: 0x10 },
  { name: 'fad1-Pbnd', prev: 'fad1-PrGC', address: SE16_BLOCK + 15 * 64, before: 0x10, after: 0x20 },
  // Batch 7: fader AFtt (3) and display (OFF 0, bPoL 2), fader 9 table (5 bytes per group), green button PrGC 3 / AFtt 4.
  { name: 'fad1-AFtt', prev: 'fad1-Pbnd', address: SE16_BLOCK + 15 * 64, before: 0x20, after: 0x30 },
  { name: 'fad1-dispOFF', prev: 'fad1-AFtt', address: SE16_BLOCK + 19 * 64, before: 0x11, after: 0x10 },
  { name: 'fad1-bPoL', prev: 'fad1-dispOFF', address: SE16_BLOCK + 19 * 64, before: 0x10, after: 0x12 },
  { name: 'fad9g1-n113', prev: 'fad1-bPoL', address: 0x1ac0 + 1, before: 0x70, after: 0x71 },
  { name: 'fad9g4-L001', prev: 'fad9g1-n113', address: 0x1ac0 + 5 * 3 + 2, before: 0x00, after: 0x01 },
  { name: 'fad9g8-ch01', prev: 'fad9g4-L001', address: 0x1ac0 + 5 * 7, before: 0x0f, after: 0x00 },
  { name: 'btn1-PrGC', prev: 'fad9g8-ch01', address: SE16_BLOCK + 10 * 64, before: 0x20, after: 0x30 },
  { name: 'btn1-AFtt', prev: 'btn1-PrGC', address: SE16_BLOCK + 10 * 64, before: 0x30, after: 0x40 },
  // Batch 8: group-name characters (encoder group names at 0x1660, 4 bytes each): 0 -> 00, 9 -> 09, j -> 13, l -> 14 (no k), z -> 20,
  // symbols after z 21..26 (26 = blank). The group-name table is per setup; SE16 starts at 0x1480 + 32*15 = 0x1660.
  { name: 'g1name-0', prev: 'btn1-AFtt', address: 0x1660, before: 0x10, after: 0x00 },
  { name: 'g1name-9', prev: 'g1name-0', address: 0x1660, before: 0x00, after: 0x09 },
  { name: 'g1name-z', prev: 'g1name-9', address: 0x1660, before: 0x09, after: 0x20 },
  { name: 'g1name-j', prev: 'g1name-z', address: 0x1660, before: 0x20, after: 0x13 },
  { name: 'g1name-l', prev: 'g1name-j', address: 0x1660, before: 0x13, after: 0x14 },
  { name: 'g2name-l', prev: 'g1name-l', address: 0x1664, before: 0x10, after: 0x14 },
  { name: 'g2name-sym1', prev: 'g2name-l', address: 0x1664, before: 0x14, after: 0x21 },
  { name: 'g2name-sym2', prev: 'g2name-sym1', address: 0x1664, before: 0x21, after: 0x22 },
  { name: 'g2name-sym3', prev: 'g2name-sym2', address: 0x1664, before: 0x22, after: 0x23 },
  { name: 'g2name-sym4', prev: 'g2name-sym3', address: 0x1664, before: 0x23, after: 0x24 },
  { name: 'g2name-sym5', prev: 'g2name-sym4', address: 0x1664, before: 0x24, after: 0x25 },
  { name: 'g2name-sym6', prev: 'g2name-sym5', address: 0x1664, before: 0x25, after: 0x26 },
  // Batch 8b: u (also shown for v) 1D, x (shows as H) 1E, y 1F.
  { name: 'g2name-u', prev: 'g2name-sym6', address: 0x1664, before: 0x26, after: 0x1d },
  { name: 'g2name-x', prev: 'g2name-u', address: 0x1664, before: 0x1d, after: 0x1e },
  { name: 'g2name-y', prev: 'g2name-x', address: 0x1664, before: 0x1e, after: 0x1f },
  // Batch 9: control 8 of group 8 (stride) for push button, green button, fader; fader 9 groups 6-8, 5.
  // last-ch-num-lower also shows an accidental FAd8 upper U126 -> U127 (0x6BBF; already confirmed by pbf8-stride), not part of the plan.
  { name: 'last-ch-num-lower', prev: 'g2name-y', address: 0x687f, before: 0x1f, after: 0x10, also: [{ address: 0x69ff, before: 0x7f, after: 0x7e }, { address: 0x6b7f, before: 0x00, after: 0x01 }, { address: 0x6bbf, before: 0x7e, after: 0x7f }] },
  { name: 'last-lower-ch-num', prev: 'last-ch-num-lower', address: 0x68ff, before: 0x00, after: 0x01, also: [{ address: 0x69bf, before: 0x1f, after: 0x10 }, { address: 0x6b3f, before: 0x6f, after: 0x6e }] },
  { name: 'last-upper-ch', prev: 'last-lower-ch-num', address: 0x693f, before: 0x7f, after: 0x7e, also: [{ address: 0x6a7f, before: 0x7f, after: 0x7e }, { address: 0x6aff, before: 0x0f, after: 0x00 }] },
  { name: 'last-mode-disp', prev: 'last-upper-ch', address: 0x697f, before: 0x00, after: 0x10, also: [{ address: 0x6abf, before: 0x01, after: 0x00 }, { address: 0x6bff, before: 0x01, after: 0x11 }] },
  { name: 'last-types', prev: 'last-mode-disp', address: 0x687f, before: 0x10, after: 0x20, also: [{ address: 0x69bf, before: 0x10, after: 0x20 }, { address: 0x6aff, before: 0x00, after: 0x10 }] },
  { name: 'fad9-g876', prev: 'last-types', address: 0x1ad9, before: 0x0f, after: 0x1f, also: [{ address: 0x1ae2, before: 0x01, after: 0x11 }, { address: 0x1ae6, before: 0x7f, after: 0x7e }] },
  { name: 'fad9g5-dispOFF', prev: 'fad9-g876', address: 0x1ad8, before: 0x01, after: 0x00 },
];

for (const c of chain) {
  test(`${c.name}: round trip identical; differs from ${c.prev} at 0x${c.address.toString(16)} (${c.before.toString(16)} -> ${c.after.toString(16)})${c.also ? ' and ' + c.also.length + ' more' : ''}`, () => {
    const bytes = load(c.name);
    const r = parseFrame(splitMessages(bytes)[0]!);
    assert.ok(r.ok && r.frame.lossless);
    assert.deepEqual(r.warnings, []);
    assert.deepEqual(writeFrame(r.frame), bytes);
    const p = parseFrame(splitMessages(load(c.prev))[0]!);
    assert.ok(p.ok && p.frame.lossless);
    const changes = diffImages(buildImage([p.frame]), buildImage([r.frame]));
    assert.deepEqual(changes, [{ address: c.address, before: c.before, after: c.after }, ...(c.also ?? [])]);
  });
}

test('the whole type run (enc1-U126 -> enc1-CCAb-n031) changed only the number byte', () => {
  const a = parseFrame(splitMessages(load('enc1-U126'))[0]!);
  const b = parseFrame(splitMessages(load('enc1-CCAb-n031'))[0]!);
  assert.ok(a.ok && b.ok);
  assert.deepEqual(diffImages(buildImage([a.frame]), buildImage([b.frame])), [{ address: SE16_BLOCK + 64, before: 0x7f, after: 0x1f }]);
});

// factory-SndA: all 18 setups after rESA (firmware 02.05); holds no user data.
test('factory-SndA: one message, parses, sums ok, round trip byte-identical and lossless', () => {
  const bytes = load('factory-SndA');
  const msgs = splitMessages(bytes);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0]!.length, 100640);
  const r = parseFrame(msgs[0]!);
  assert.ok(r.ok && r.frame.lossless);
  assert.deepEqual(r.warnings, []);
  assert.ok(r.frame.records.every((x) => x.sumOk));
  assert.deepEqual(writeFrame(r.frame), bytes);
});

test('factory-SndA: the image covers every name entry and control block of the 18 setups, without conflicts', () => {
  const r = parseFrame(splitMessages(load('factory-SndA'))[0]!);
  assert.ok(r.ok);
  const img = buildImage([r.frame]);
  for (let s = 1; s <= 18; s++) {
    const names = 0x1480 + 32 * (s - 1), blk = 0x1c00 + 0x500 * (s - 1);
    for (let k = 0; k < 32; k++) assert.ok(img.covered[names + k], `SE${s} name byte ${k}`);
    for (let k = 0; k < 0x500; k++) assert.ok(img.covered[blk + k], `SE${s} block byte ${k}`);
  }
  assert.deepEqual(img.conflicts, []);
});
