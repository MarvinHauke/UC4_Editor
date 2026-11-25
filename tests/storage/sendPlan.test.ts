// Plan a send (plan 0005 step 12): the built Sndc, the change list, the backup and the refusals.
import { test } from 'vitest';
import '../protocol/markOLikely.ts'; // first: marks `o` as likely so an edit is refused (the gate's test field)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { uc4Engine } from '../../src/protocol/engine.ts';
import { parseFrame, writeFrame } from '../../src/protocol/frame.ts';
import { openLibrary, memoryStorage, CHANGES_SHOWN } from '../../src/storage/index.ts';
import type { Library } from '../../src/storage/index.ts';

const T0 = Date.parse('2026-11-18T10:00:00.000Z');
let clockMs = T0 + 60_000;
const clock = () => new Date(clockMs);
const fx = (n: string) => new Uint8Array(readFileSync(new URL(`../fixtures/sysex/${n}.syx`, import.meta.url)));
/** A SndA that differs from factory-SndA in SE16 only (group 1 name `tag`): another "SndA the UC4 sent", built from scratch data. */
const variantSndA = (tag: string): Uint8Array => {
  const base = { bytes: fx('factory-SndA'), source: { kind: 'generated' as const }, capturedAt: '', engineVersion: '' };
  const m = uc4Engine.parse(base.bytes, base.source);
  assert.ok(m.ok);
  const d = uc4Engine.decode(m.messages[0]!);
  assert.ok(d.ok);
  const setup = structuredClone(d.setups.find((x) => x.slot === 16)!.setup);
  setup.encoderGroups[0]!.name = tag;
  const e = uc4Engine.encode({ message: 'all', base, setups: [{ slot: 16, setup }] });
  assert.ok(e.ok);
  return e.raw.bytes;
};
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const setupAt = (lib: Library, slot: number) => lib.getState().configuration.setups.find((s) => s.slot === slot)!;
const enc = (lib: Library, slot: number, index = 0, group = 0) => ({ setupId: setupAt(lib, slot).id, area: 'encoders' as const, group, index });

/** A library holding SE16 from the kept Sndc `base`, and a SndA received from the device at `clockMs`. */
async function ready(received = true): Promise<Library> {
  clockMs = T0 + 60_000;
  const lib = (await openLibrary(memoryStorage(), { now: clock })).library;
  lib.importFile(fx('base'), { replace: true });
  if (received) lib.keepDump(fx('factory-SndA'), 'received');
  return lib;
}
const ok = (p: ReturnType<Library['planSend']>) => { assert.ok(p.ok, JSON.stringify(p)); return p; };

test('an unchanged setup plans to send exactly its kept Sndc, with "No changes" and the backup', async () => {
  const lib = await ready();
  const p = ok(lib.planSend(16, { connectedAt: T0 }));
  assert.ok(same(p.bytes, fx('base')));
  assert.deepEqual(p.changes, { lines: [], items: [], more: 0, total: 0 });
  assert.equal(p.backup!.receivedAt, new Date(T0 + 60_000).toISOString());
});

test('a name change on SE16 is the byte-for-byte Sndc the UC4 stored on 2026-11-17, listed in device words', async () => {
  const lib = await ready();
  lib.setGroupName(setupAt(lib, 16).id, 0, 'send');
  const p = ok(lib.planSend(16, { connectedAt: T0 }));
  assert.ok(same(p.bytes, fx('sndc-se16-g1-send')));
  assert.equal(p.changes.total, 1);
  assert.match(p.changes.lines[0]!, /^Encoder group 1: name \S+ → send$/i);
});

test('a property change reads "Enc1, encoder group 1: number 8 → 99"', async () => {
  const lib = await ready();
  const before = setupAt(lib, 16).encoderGroups[0]!.encoders[0]!;
  lib.setProperty(enc(lib, 16), 'number', 99);
  const p = ok(lib.planSend(16, { connectedAt: T0 }));
  assert.deepEqual(p.changes.lines, [`Enc1, encoder group 1: number ${(before as { number: number }).number} → 99`]);
});

test('the list shows at most 8 changes and counts the rest', async () => {
  const lib = await ready();
  for (let i = 0; i < 8; i += 1) lib.setProperty(enc(lib, 16, i), 'mode', setupAt(lib, 16).encoderGroups[0]!.encoders[i]!.mode === 'Acc1' ? 'Acc2' : 'Acc1');
  lib.setProperty(enc(lib, 16, 0, 1), 'mode', setupAt(lib, 16).encoderGroups[1]!.encoders[0]!.mode === 'Acc1' ? 'Acc2' : 'Acc1');
  lib.setProperty(enc(lib, 16, 1, 1), 'mode', setupAt(lib, 16).encoderGroups[1]!.encoders[1]!.mode === 'Acc1' ? 'Acc2' : 'Acc1');
  const p = ok(lib.planSend(16, { connectedAt: T0 }));
  assert.equal(p.changes.total, 10);
  assert.equal(p.changes.lines.length, CHANGES_SHOWN);
  assert.equal(p.changes.more, 2);
  assert.match(p.changes.lines[0]!, /^Enc1, encoder group 1: acceleration /);
});

test('planning changes nothing: no state message, no kept dump, no undo step', async () => {
  const lib = await ready();
  lib.setGroupName(setupAt(lib, 16).id, 0, 'send');
  const before = lib.getState();
  lib.planSend(16, { connectedAt: T0 });
  assert.equal(lib.getState(), before);
});

// --- refusals ---

test('an unconfirmed edit names the field as the export does, and the way out in send words', async () => {
  const lib = await ready();
  lib.setGroupName(setupAt(lib, 16).id, 3, 'oooo');
  const p = lib.planSend(16, { connectedAt: T0 });
  const e = lib.exportSetupSyx(setupAt(lib, 16).id);
  assert.ok(!p.ok && p.refusal.kind === 'cannot send');
  assert.equal(p.refusal.reason, e.refusal!.reason);
  assert.deepEqual(p.refusal.fields, e.refusal!.fields);
  assert.match(e.refusal!.whatToDo, /JSON/); // the export offers JSON; the send does not
  assert.doesNotMatch(p.refusal.whatToDo, /JSON/);
});

test('a setup never kept from a Sndc is sendable: it is built on the factory slot (decision 31)', async () => {
  const lib = await ready(false);
  lib.importFile(fx('factory-SndA'), { replace: true });
  const p = ok(lib.planSend(3, { connectedAt: T0 }));
  assert.deepEqual(p.base, { kind: 'factory' });
  assert.equal(p.changes.total, 0);
});

test('a slot without a setup is a refusal, not an exception', async () => {
  const lib = await ready();
  const p = lib.planSend(40, { connectedAt: T0 });
  assert.ok(!p.ok && p.refusal.kind === 'cannot build');
});

// --- freshness (decision 22) ---

test('no fresh SndA: the plan still builds, on the linked Sndc, with no backup (decision 31)', async () => {
  const lib = await ready(false);
  const p = ok(lib.planSend(16, { connectedAt: T0 }));
  assert.equal(p.backup, null);
  assert.equal(p.base.kind, 'Sndc');
  assert.deepEqual(p.changes, { lines: [], items: [], more: 0, total: 0 });
  assert.ok(same(p.bytes, fx('base')));
});

test('a SndA received before connecting does not count: no backup', async () => {
  const lib = await ready();
  const p = ok(lib.planSend(16, { connectedAt: T0 + 120_000 }));
  assert.equal(p.backup, null);
  assert.equal(p.base.kind, 'Sndc');
});

test('an imported SndA file does not count, however new', async () => {
  const lib = await ready(false);
  lib.keepDump(fx('factory-SndA'), 'file', 'backup.syx');
  const p = ok(lib.planSend(16, { connectedAt: 0 }));
  assert.equal(p.backup, null);
});

test('a Sndc received from the device is not a backup', async () => {
  const lib = await ready(false);
  lib.keepDump(fx('base'), 'received');
  assert.equal(ok(lib.planSend(16, { connectedAt: 0 })).backup, null);
});

test('the same SndA received again after connecting counts, though its bytes were kept before', async () => {
  const lib = await ready();
  clockMs = T0 + 600_000;
  lib.keepDump(fx('factory-SndA'), 'received');
  const p = ok(lib.planSend(16, { connectedAt: T0 + 300_000 }));
  assert.equal(p.backup!.receivedAt, new Date(T0 + 600_000).toISOString());
  assert.equal(lib.getState().dumps.filter((d) => d.type === 'all').length, 1, 'still one kept dump');
});

test('a SndA imported from a file and then received counts; the newest of several is named', async () => {
  const lib = await ready(false);
  lib.keepDump(fx('factory-SndA'), 'file', 'backup.syx');
  clockMs = T0 + 120_000;
  lib.keepDump(fx('factory-SndA'), 'received');
  const a = ok(lib.planSend(16, { connectedAt: T0 }));
  assert.equal(a.backup!.receivedAt, new Date(T0 + 120_000).toISOString());
  clockMs = T0 + 180_000;
  lib.keepDump(variantSndA('abcd'), 'received');
  const b = ok(lib.planSend(16, { connectedAt: T0 }));
  assert.equal(b.backup!.receivedAt, new Date(T0 + 180_000).toISOString());
  assert.notEqual(b.backup!.dumpId, a.backup!.dumpId);
});

test('the build refusal does not depend on a backup', async () => {
  const lib = await ready(false);
  lib.setGroupName(setupAt(lib, 16).id, 3, 'oooo');
  const p = lib.planSend(16, { connectedAt: T0 });
  assert.ok(!p.ok && p.refusal.kind === 'cannot send');
});

// --- the base (decisions 30, 31) ---

const sndA = (lib: Library) => { clockMs = T0 + 90_000; lib.keepDump(fx('factory-SndA'), 'received'); };

test('an unlinked setup plans on the fresh SndA: SE03 imported from a SndA file', async () => {
  const lib = await ready();
  lib.importFile(fx('factory-SndA'), { replace: true });
  const p = ok(lib.planSend(3, { connectedAt: T0 }));
  assert.equal(p.base.kind, 'SndA');
  assert.deepEqual(p.changes, { lines: [], items: [], more: 0, total: 0 });
});

test('the changes are against the SndA\'s slot, not the setup\'s linked Sndc', async () => {
  const lib = (await openLibrary(memoryStorage(), { now: clock })).library;
  lib.importFile(fx('combined-se16'), { replace: true }); // SE16 as a kept Sndc with many changes holds it
  lib.keepDump(fx('factory-SndA'), 'received'); // what the UC4 holds now
  const against = ok(lib.planSend(16, { connectedAt: T0 }));
  assert.equal(against.base.kind, 'SndA');
  const noSndA = ok(lib.planSend(16, { connectedAt: Date.now() + 1e9 }));
  assert.equal(noSndA.base.kind, 'Sndc');
  assert.equal(noSndA.changes.total, 0);
  assert.ok(against.changes.total > 0, 'the SndA holds another SE16 than the linked Sndc');
});

test('with factory SE16 on the SndA, group-1 name "send" builds the file the UC4 stored on 2026-11-17', async () => {
  const lib = (await openLibrary(memoryStorage(), { now: clock })).library;
  lib.importFile(fx('factory-SndA'), { replace: true });
  sndA(lib);
  lib.setGroupName(setupAt(lib, 16).id, 0, 'send');
  const p = ok(lib.planSend(16, { connectedAt: T0 }));
  assert.equal(p.base.kind, 'SndA');
  assert.ok(same(p.bytes, fx('sndc-se16-g1-send')));
  assert.equal(p.changes.total, 1);
});

test('no SndA and no linked Sndc: the factory slot is the base, and says so', async () => {
  const lib = (await openLibrary(memoryStorage(), { now: clock })).library;
  lib.importFile(fx('factory-SndA'), { replace: true });
  lib.setGroupName(setupAt(lib, 16).id, 0, 'send');
  const p = ok(lib.planSend(16, { connectedAt: T0 }));
  assert.deepEqual(p.base, { kind: 'factory' });
  assert.equal(p.backup, null);
  assert.ok(same(p.bytes, fx('sndc-se16-g1-send')));
});

test('a changed field the engine cannot write refuses on every base, in send words; nothing is reset to factory', async () => {
  const noSndA = (await openLibrary(memoryStorage(), { now: clock })).library;
  noSndA.importFile(fx('factory-SndA'), { replace: true });
  noSndA.setGroupName(setupAt(noSndA, 16).id, 3, 'oooo');
  const withSndA = (await openLibrary(memoryStorage(), { now: clock })).library;
  withSndA.importFile(fx('factory-SndA'), { replace: true });
  sndA(withSndA);
  withSndA.setGroupName(setupAt(withSndA, 16).id, 3, 'oooo');
  for (const lib of [noSndA, withSndA]) {
    const p = lib.planSend(16, { connectedAt: T0 });
    assert.ok(!p.ok && p.refusal.kind === 'cannot send', JSON.stringify(p));
    assert.ok(p.refusal.fields.length > 0);
    assert.doesNotMatch(p.refusal.whatToDo, /JSON|export/i);
    assert.match(p.refusal.whatToDo, /send again/);
  }
});

// Encoder 1 type of SE16 with a code outside the table: the editor shows the factory value, marked (decisions 8, 9).
function withByte(bytes: Uint8Array, address: number, value: number): Uint8Array {
  const r = parseFrame(bytes);
  assert.ok(r.ok);
  const frame = r.frame;
  const rec = frame.records.find((x) => address >= x.address && address < x.address + x.data.length)!;
  rec.data[address - rec.address] = value;
  rec.sumInDump = rec.sumComputed = rec.data.reduce((a, v) => (a + v) & 0xffff, 0);
  return writeFrame(frame);
}

test('marked unreadable values: patched on their own Sndc they send; on a SndA base they are refused, not reset to factory', async () => {
  const lib = (await openLibrary(memoryStorage(), { now: clock })).library;
  lib.importFile(withByte(fx('base'), 0x1c00 + 0x500 * 15, 0x7f), { replace: true });
  assert.equal(lib.getState().setups[15]!.problemCount, 1);
  const own = ok(lib.planSend(16, { connectedAt: T0 }));
  assert.equal(own.base.kind, 'Sndc');
  assert.deepEqual(own.changes, { lines: [], items: [], more: 0, total: 0 });
  sndA(lib);
  const p = lib.planSend(16, { connectedAt: T0 });
  assert.ok(!p.ok && p.refusal.kind === 'cannot build');
  assert.match(p.refusal.reason, /could not read/);
  assert.doesNotMatch(p.refusal.whatToDo, /JSON|export/i);
  assert.match(p.refusal.whatToDo, /send again/);
});

test('a group-name change carries its values beside the text; other changes carry only text', async () => {
  const lib = await ready();
  lib.setGroupName(setupAt(lib, 16).id, 0, 'send');
  lib.setProperty(enc(lib, 16), 'number', 99);
  const p = ok(lib.planSend(16, { connectedAt: T0 }));
  assert.deepEqual(p.changes.items.map((i) => i.text), p.changes.lines);
  const name = p.changes.items.find((i) => i.name)!;
  assert.equal(name.name!.group, 1);
  assert.equal(name.name!.to, 'send');
  assert.equal(p.changes.items.filter((i) => i.name).length, 1);
});
