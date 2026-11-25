// Run: npm test
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { parseFrame, splitMessages, writeFrame, RECORD_PADDING } from '../../src/protocol/frame.ts';
import type { ParsedFrame } from '../../src/protocol/frame.ts';
import { buildImage, diffImages, describeAddress } from '../../src/protocol/image.ts';

function tok(cmd: number, v: number): number[] { return [0x40 | cmd, 0x20 | (v >> 4), 0x10 | (v & 15)]; }
function frameBytes(header: number[], recs: { addr: number; data: number[]; sum?: number }[], trailer = 6): Uint8Array {
  const out = [0xf0, 0, 0, 0];
  header.forEach((v, i) => out.push(...tok(i + 1, v)));
  for (const r of recs) {
    const sum = r.sum ?? r.data.reduce((a, b) => (a + b) & 0xffff, 0);
    out.push(...tok(9, r.addr >> 8), ...tok(0xa, r.addr & 255));
    r.data.forEach((v) => out.push(...tok(0xd, v)));
    out.push(...tok(0xb, sum >> 8), ...tok(0xc, sum & 255), ...new Array(RECORD_PADDING).fill(0));
  }
  out.push(...tok(0xf, trailer), 0xf7);
  return Uint8Array.from(out);
}
const data64 = (seed: number): number[] => Array.from({ length: 64 }, (_, i) => (seed + i) & 0xff);

test('parses header, records, trailer and checks sums', () => {
  const r = parseFrame(frameBytes([6, 3, 2, 5], [{ addr: 0x1480, data: data64(1) }, { addr: 0x14c0, data: data64(9) }]));
  assert.ok(r.ok);
  assert.deepEqual(r.frame.header, [6, 3, 2, 5]);
  assert.equal(r.frame.records.length, 2);
  assert.equal(r.frame.records[1]!.address, 0x14c0);
  assert.ok(r.frame.records.every((x) => x.sumOk));
  assert.equal(r.frame.trailer, 6);
  assert.deepEqual(r.warnings, []);
});

test('a wrong sum is a warning, not a throw', () => {
  const r = parseFrame(frameBytes([6, 2, 2, 5], [{ addr: 0x1740, data: data64(0), sum: 1 }]));
  assert.ok(r.ok);
  assert.equal(r.frame.records[0]!.sumOk, false);
  assert.match(r.warnings.join(), /bad sum/);
});

test('rejects what is not a UC4 dump with a reason', () => {
  assert.deepEqual(parseFrame(Uint8Array.from([1, 2, 3])).ok, false);
  const wrongId = frameBytes([6, 3, 2, 5], []); wrongId[1] = 0x41;
  const r = parseFrame(wrongId);
  assert.ok(!r.ok && /manufacturer/.test(r.reason));
  const garbage = Uint8Array.from([0xf0, 0, 0, 0, 0x55, 0xf7]);
  assert.ok(!parseFrame(garbage).ok);
});

test('write(parse(x)) is byte-identical, incl. a short record', () => {
  const b = frameBytes([6, 2, 2, 5], [{ addr: 0x14a0, data: data64(3).slice(0, 32) }, { addr: 0x1740, data: data64(7) }]);
  const r = parseFrame(b);
  assert.ok(r.ok);
  assert.deepEqual(writeFrame(r.frame), b);
});

test('splitMessages finds every F0…F7 and ignores stray bytes', () => {
  const a = frameBytes([6, 3, 2, 5], []), b = frameBytes([6, 2, 2, 5], []);
  const m = splitMessages(Uint8Array.from([0x11, ...a, 0x22, ...b]));
  assert.equal(m.length, 2);
  assert.deepEqual(m[1], b);
});

function image(recs: { addr: number; data: number[] }[]): ReturnType<typeof buildImage> {
  const r = parseFrame(frameBytes([6, 3, 2, 5], recs));
  assert.ok(r.ok);
  return buildImage([r.frame as ParsedFrame]);
}

test('image places records by address and diff reports changed bytes and coverage gaps', () => {
  const a = image([{ addr: 0x1c00, data: data64(0) }]);
  const d2 = data64(0); d2[5] = 0xaa;
  const b = image([{ addr: 0x1c00, data: d2 }, { addr: 0x1c40, data: data64(0) }]);
  assert.equal(a.bytes[0x1c05], 5);
  const ch = diffImages(a, b);
  assert.equal(ch[0]!.address, 0x1c05);
  assert.deepEqual([ch[0]!.before, ch[0]!.after], [5, 0xaa]);
  assert.equal(ch[1]!.address, 0x1c40);
  assert.equal(ch[1]!.before, null);
});

test('describeAddress names the likely layout', () => {
  assert.equal(describeAddress(0x1480 + 32 * 1 + 4 * 2 + 1), 'SE02 group name G3 char 2');
  assert.equal(describeAddress(0x1c00 + 0x500 * 15 + 1 * 64 + 8 * 2 + 3), 'SE16 enc number G3.4');
  assert.equal(describeAddress(0x1c00 + 19 * 64), 'SE01 fader mode/scale G1.1');
  assert.equal(describeAddress(0x1740 + 6), 'SE02 fader9 G2 number');
});

test('well-formed frame is lossless; a bad sum is kept as received, not corrected', () => {
  const b = frameBytes([6, 2, 2, 5], [{ addr: 0x1740, data: data64(0), sum: 1 }]);
  const r = parseFrame(b);
  assert.ok(r.ok && r.frame.lossless);
  assert.deepEqual(writeFrame(r.frame), b);
  assert.equal(r.frame.records[0]!.sumInDump, 1);
});

test('odd padding is kept per record', () => {
  const b = frameBytes([6, 3, 2, 5], [{ addr: 0x1480, data: data64(0) }]);
  const i = b.indexOf(0xf7);
  const shorter = Uint8Array.from([...b.subarray(0, i - 3 - 1), ...b.subarray(i - 3)]); // drop one padding zero
  const r = parseFrame(shorter);
  assert.ok(r.ok);
  assert.equal(r.frame.records[0]!.paddingAfter, RECORD_PADDING - 1);
  assert.deepEqual(writeFrame(r.frame), shorter);
  assert.ok(r.frame.lossless);
});

test('an unknown command makes the frame not lossless, with a warning', () => {
  const b = frameBytes([6, 3, 2, 5], []);
  const withUnknown = Uint8Array.from([...b.subarray(0, 16), ...tok(7, 9), ...b.subarray(16)]);
  const r = parseFrame(withUnknown);
  assert.ok(r.ok);
  assert.equal(r.frame.lossless, false);
  assert.match(r.warnings.join(), /unknown command 7/);
  assert.match(r.warnings.join(), /cannot be written back/);
});

test('a missing header command fails; a repeated one warns', () => {
  const b = frameBytes([6, 3, 2, 5], []);
  const noCmd1 = Uint8Array.from([...b.subarray(0, 4), ...b.subarray(7)]);
  const r = parseFrame(noCmd1);
  assert.ok(!r.ok && /header command 1 missing/.test(r.reason));
  const rep = parseFrame(Uint8Array.from([...b.subarray(0, 7), ...tok(1, 6), ...b.subarray(7)]));
  assert.ok(rep.ok && /repeated/.test(rep.warnings.join()) && !rep.frame.lossless);
});
