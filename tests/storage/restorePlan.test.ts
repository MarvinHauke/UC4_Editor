// Restore one setup from the backup (plan 0005 step 14): the backup choice, the bytes, the changes, the guard, the refusals.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { uc4Engine } from '../../src/protocol/engine.ts';
import { openLibrary, memoryStorage } from '../../src/storage/index.ts';
import type { Library } from '../../src/storage/index.ts';

const T0 = Date.parse('2026-11-18T10:00:00.000Z');
let clockMs = T0;
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
const cutOf = (sndA: Uint8Array, slot: number) => {
  const r = uc4Engine.cutSlot({ bytes: sndA, source: { kind: 'generated' }, capturedAt: '', engineVersion: '' }, slot);
  assert.ok(r.ok); return r.raw.bytes;
};
const A = () => fx('factory-SndA');
const B = () => variantSndA('abcd');

/** SE16 from the kept Sndc `base`, SndA `A` received at +60 s. */
async function ready(): Promise<{ lib: Library; store: ReturnType<typeof memoryStorage> }> {
  clockMs = T0 + 60_000;
  const store = memoryStorage();
  const lib = (await openLibrary(store, { now: clock })).library;
  lib.importFile(fx('base'), { replace: true });
  lib.keepDump(A(), 'received');
  return { lib, store };
}
/** Plan and record a send of SE16 with a changed group name, at `clockMs`. */
function sendNamed(lib: Library): Uint8Array {
  lib.setGroupName(setupAt(lib, 16).id, 0, 'send');
  const p = lib.planSend(16, { connectedAt: T0 });
  assert.ok(p.ok);
  lib.recordSend(16, p);
  return p.bytes;
}
const idOfSndA = (lib: Library, which: number) => lib.getState().dumps.filter((d) => d.type === 'all').at(which)!.id;

test('the restore bytes are the backup SndA\'s slot, unchanged', async () => {
  const { lib } = await ready();
  clockMs += 1000; sendNamed(lib);
  const p = lib.planRestore(16, { connectedAt: T0 });
  assert.ok(p.ok);
  assert.ok(same(p.bytes, cutOf(A(), 16)));
  assert.ok(same(p.bytes, fx('base')), 'factory SE16 is the base Sndc');
});

test('against the last sent bytes: the changes name what the send changed, back', async () => {
  const { lib } = await ready();
  clockMs += 1000; sendNamed(lib);
  const p = lib.planRestore(16, { connectedAt: T0 });
  assert.ok(p.ok);
  assert.equal(p.against?.kind, 'sent');
  assert.equal(p.changes?.total, 1);
  assert.match(p.changes!.lines[0]!, /^Encoder group 1: name send → \S+$/i);
});

test('the library\'s setup is not changed, no undo step, no message', async () => {
  const { lib } = await ready();
  clockMs += 1000; sendNamed(lib);
  const before = lib.getState();
  lib.planRestore(16, { connectedAt: T0 });
  const after = lib.getState();
  assert.equal(after.configuration, before.configuration);
  assert.equal(after.canUndo, before.canUndo);
  assert.equal(after.message, before.message);
});

test('backup choice: the SndA the last send named wins over a newer one; the newer one is what the UC4 holds now', async () => {
  const { lib } = await ready();
  clockMs += 1000; sendNamed(lib);
  clockMs += 60_000; lib.keepDump(B(), 'received');
  const named = lib.getState().lastSends[16]!.backup!.dumpId;
  const p = lib.planRestore(16, { connectedAt: T0 });
  assert.ok(p.ok);
  assert.equal(p.backup.dumpId, named);
  assert.ok(same(p.bytes, cutOf(A(), 16)));
  assert.equal(p.against?.kind, 'SndA');
  assert.equal(p.against?.kind === 'SndA' && p.against.dumpId, idOfSndA(lib, 0));
  assert.notEqual(named, idOfSndA(lib, 0));
});

test('backup choice: with no send recorded, the newest fresh SndA', async () => {
  const { lib } = await ready();
  clockMs += 60_000; lib.keepDump(B(), 'received');
  const p = lib.planRestore(16, { connectedAt: T0 });
  assert.ok(p.ok);
  assert.ok(same(p.bytes, cutOf(B(), 16)));
  assert.equal(p.backup.dumpId, idOfSndA(lib, 0));
  assert.equal(p.against, null, 'nothing newer is known');
  assert.equal(p.changes, null);
});

test('no send recorded and no SndA from this connection: a refusal that says what to do', async () => {
  const { lib } = await ready();
  const p = lib.planRestore(16, { connectedAt: T0 + 1e9 });
  assert.ok(!p.ok);
  assert.equal(p.refusal.kind, 'no backup');
  assert.match(p.refusal.whatToDo, /SndA/);
});

test('a send without a backup cannot be restored, even when a SndA arrived after it', async () => {
  const { lib } = await ready();
  lib.setGroupName(setupAt(lib, 16).id, 0, 'send');
  const p0 = lib.planSend(16, { connectedAt: T0 + 1e9 });
  assert.ok(p0.ok && p0.backup === null);
  lib.recordSend(16, p0);
  clockMs += 60_000; lib.keepDump(B(), 'received');
  const p = lib.planRestore(16, { connectedAt: T0 });
  assert.ok(!p.ok);
  assert.equal(p.refusal.kind, 'no backup');
  assert.match(p.refusal.reason, /without a backup/);
});

test('the named backup deleted: refused in words, not guessed from another SndA', async () => {
  const { lib } = await ready();
  clockMs += 1000; sendNamed(lib);
  clockMs += 60_000; lib.keepDump(B(), 'received');
  lib.deleteDump(lib.getState().lastSends[16]!.backup!.dumpId);
  const p = lib.planRestore(16, { connectedAt: T0 });
  assert.ok(!p.ok);
  assert.match(p.refusal.reason, /no longer kept/);
});

test('a backup that cannot be cut: refused as "cannot restore"', async () => {
  const { lib } = await ready();
  const p = lib.planRestore(0, { connectedAt: T0 });
  assert.ok(!p.ok);
  assert.equal(p.refusal.kind, 'cannot restore');
});

test('a Sndc is not a backup: only a SndA can be cut', async () => {
  clockMs = T0 + 60_000;
  const lib = (await openLibrary(memoryStorage(), { now: clock })).library;
  lib.keepDump(fx('base'), 'received');
  const p = lib.planRestore(16, { connectedAt: T0 });
  assert.ok(!p.ok);
  assert.equal(p.refusal.kind, 'no backup');
});

test('lastSends: time and backup per slot, without the bytes; the next send replaces it', async () => {
  const { lib } = await ready();
  clockMs += 1000; sendNamed(lib);
  const first = lib.getState().lastSends[16]!;
  assert.equal(first.sentAt, new Date(clockMs).toISOString());
  assert.equal(first.backup?.dumpId, idOfSndA(lib, 0));
  assert.ok(!('bytes' in first));
  clockMs += 5000;
  lib.recordSend(16, { bytes: fx('base'), backup: null });
  assert.equal(lib.getState().lastSends[16]!.backup, null);
});

test('the last sends are saved beside the library and read back; they are not in the uc4-config JSON', async () => {
  const { lib, store } = await ready();
  clockMs += 1000; const sent = sendNamed(lib);
  await lib.whenSaved();
  assert.ok(!store.text()!.includes('lastSends') && !store.text()!.includes(store.sendsText()!.slice(10, 40)));
  const again = (await openLibrary(store, { now: clock })).library;
  assert.deepEqual(again.getState().lastSends, lib.getState().lastSends);
  const p = again.planRestore(16, { connectedAt: T0 });
  assert.ok(p.ok && p.against?.kind === 'sent');
  assert.ok(sent.length > 0);
});

test('guard: the SndA a send names is needed by that slot\'s setup; Clear old dumps keeps it', async () => {
  const { lib } = await ready();
  clockMs += 1000; sendNamed(lib);
  clockMs += 60_000; lib.keepDump(B(), 'received');
  clockMs += 60_000; lib.keepDump(variantSndA('efgh'), 'received');
  const named = lib.getState().lastSends[16]!.backup!.dumpId;
  const needs = lib.dumpNeeds(named);
  assert.deepEqual(needs.map((n) => [n.slot, n.reasons]), [[16, ['send-backup']]]);
  const plan = lib.planClearDumps();
  const entry = plan.entries.find((e) => e.id === named)!;
  assert.equal(entry.action, 'keep');
  assert.ok(entry.keepBecause.includes('needed'));
  lib.clearOldDumps();
  assert.ok(lib.getState().dumps.some((d) => d.id === named));
});

test('guard: after a send with no backup, nothing is held back for it', async () => {
  const { lib } = await ready();
  lib.recordSend(16, { bytes: fx('base'), backup: null });
  assert.deepEqual(lib.dumpNeeds(idOfSndA(lib, 0)), []);
});
