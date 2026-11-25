// What a kept dump is needed for and "Clear old dumps" (plan 0005 step 6, decisions 10 and 15).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openLibrary, memoryStorage } from '../../src/storage/index.ts';
import { dumpNeeds, newestBackupId, planClearOldDumps } from '../../src/storage/keptDumpPlan.ts';
import { parseFrame, writeFrame } from '../../src/protocol/frame.ts';
import type { PlanDump } from '../../src/storage/keptDumpPlan.ts';

const d = (id: string, date: string, type: PlanDump['type'], slots: number[]): PlanDump => ({ id, date, type, slots });
const all = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

test('needs: a linked setup needs its dump to revert; a Sndc of its own slot also to export', () => {
  const dumps = [d('a', '2026-01-01', 'all', all(18)), d('c', '2026-01-02', 'one', [5])];
  const setups = [{ id: 's5', name: 'Five', slot: 5 }, { id: 's6', name: 'Six', slot: 6 }, { id: 's7', name: 'Seven', slot: 7 }];
  const links = { s5: { dump: 'c', slot: 5 }, s6: { dump: 'a', slot: 6 } };
  const n = dumpNeeds(dumps, links, setups);
  assert.deepEqual(n['c'], [{ setupId: 's5', setupName: 'Five', slot: 5, reasons: ['revert', 'sndc-export'] }]);
  assert.deepEqual(n['a'], [{ setupId: 's6', setupName: 'Six', slot: 6, reasons: ['revert'] }]);
  assert.deepEqual(Object.keys(n).sort(), ['a', 'c'], 'unlinked s7 needs nothing');
});

test('needs: a link to another slot of a Sndc is not an export base; a marked setup needs a source dump', () => {
  const dumps = [d('c', '2026-01-02', 'one', [5]), d('a', '2026-01-01', 'all', all(18))];
  const setups = [{ id: 's9', name: 'Nine', slot: 9 }, { id: 's6', name: 'Six', slot: 6 }];
  const n = dumpNeeds(dumps, { s9: { dump: 'c', slot: 5 }, s6: { dump: 'a', slot: 6 } }, setups, new Set(['s6']));
  assert.deepEqual(n['c']![0]!.reasons, ['revert']);
  assert.deepEqual(n['a']![0]!.reasons, ['revert', 'unreadable-values']);
});

const rcv = (x: PlanDump, at = x.date) => ({ ...x, received: at });

test('plan: only the newest received SndA stays; every Sndc nothing needs goes, the newest of its slot too', () => {
  const dumps = [
    rcv(d('a1', '2026-01-01', 'all', all(18))), rcv(d('a2', '2026-01-03', 'all', all(18))),
    d('c5a', '2026-01-02', 'one', [5]), d('c5b', '2026-01-04', 'one', [5]), d('c6', '2026-01-01', 'one', [6]),
  ];
  const p = planClearOldDumps(dumps, {});
  assert.deepEqual(p.entries.map((e) => e.id), ['c5b', 'a2', 'c5a', 'a1', 'c6'], 'newest first');
  assert.deepEqual(p.keepIds, ['a2']);
  assert.deepEqual(p.hideIds, ['a2']);
  assert.deepEqual(p.deleteIds, ['c5b', 'c5a', 'a1', 'c6']);
  assert.deepEqual(p.entries.find((e) => e.id === 'a2')!.keepBecause, ['backup']);
});

test('plan: a SndA imported from a file or unreadable is no backup; the newest received one is', () => {
  const dumps = [d('imp', '2026-01-09', 'all', all(18)), rcv(d('rec', '2026-01-02', 'all', all(18))), { ...rcv(d('bad', '2026-01-10', 'all', [])), unreadable: true }];
  assert.deepEqual(newestBackupId(dumps), 'rec');
  assert.deepEqual(planClearOldDumps(dumps, {}).keepIds, ['rec']);
  assert.equal(newestBackupId([d('imp', '2026-01-09', 'all', all(18))]), undefined);
});

test('plan: a dump a setup needs stays, with the reason, beside the backup; already hidden ones are not hidden again', () => {
  const dumps = [rcv(d('a1', '2026-01-01', 'all', all(18))), { ...rcv(d('a2', '2026-01-03', 'all', all(18))), hidden: true }, d('c5', '2026-01-04', 'one', [5])];
  const needs = dumpNeeds(dumps, { s1: { dump: 'a1', slot: 1 }, s5: { dump: 'c5', slot: 5 } }, [{ id: 's1', name: 'One', slot: 1 }, { id: 's5', name: 'Five', slot: 5 }]);
  const p = planClearOldDumps(dumps, needs);
  assert.deepEqual(p.deleteIds, []);
  assert.deepEqual(p.hideIds, ['c5', 'a1']);
  const e = p.entries.find((x) => x.id === 'a1')!;
  assert.deepEqual([e.action, e.keepBecause, e.neededBy[0]!.setupName], ['keep', ['needed'], 'One']);
  assert.deepEqual(p.entries.find((x) => x.id === 'a2')!.keepBecause, ['backup']);
});

test('plan: unreadable dumps all go', () => {
  const p = planClearOldDumps([d('u1', '2026-01-01', 'unknown', []), d('u2', '2026-01-02', 'unknown', [])], {});
  assert.deepEqual(p.keepIds, []);
  assert.deepEqual(p.deleteIds, ['u2', 'u1']);
  assert.equal(p.entries[1]!.kind, 'unreadable dump');
});

test('plan: nothing to clear gives empty lists', () => {
  const p = planClearOldDumps([], {});
  assert.deepEqual([p.deleteIds, p.hideIds], [[], []]);
});

// --- through the library ---
const fixture = (n: string): Uint8Array => new Uint8Array(readFileSync(new URL(`../fixtures/sysex/${n}.syx`, import.meta.url)));
let tick = 0;
const clock = () => new Date(Date.UTC(2026, 10, 15, 10, 0, tick++));

test('library: dumpNeeds names the setup and what stops; the list is newest first', async () => {
  const storage = memoryStorage();
  const lib = (await openLibrary(storage, { now: clock })).library;
  lib.importFile(fixture('factory-SndA'));
  lib.importFile(fixture('base'), { replace: true });
  const s = lib.getState();
  assert.ok(s.dumps[0]!.date > s.dumps[1]!.date);
  const sndc = s.dumps.find((x) => x.type === 'one')!;
  const needs = lib.dumpNeeds(sndc.id);
  assert.deepEqual(needs.map((n) => [n.slot, n.reasons]), [[16, ['revert', 'sndc-export']]]);
  assert.deepEqual(lib.dumpNeeds('nope'), []);
});

const withByte = (bytes: Uint8Array, address: number, value: number): Uint8Array => {
  const r = parseFrame(bytes);
  assert.ok(r.ok);
  const rec = r.frame.records.find((x) => address >= x.address && address < x.address + x.data.length)!;
  rec.data[address - rec.address] = value;
  rec.sumInDump = rec.sumComputed = rec.data.reduce((a, v) => (a + v) & 0xffff, 0);
  return writeFrame(r.frame);
};
const odd = () => withByte(fixture('base'), 0x1c00 + 0x500 * 15, 0x7f);

test('library: clearOldDumps deletes what nothing needs, hides what stays, saves both, is not an undo step', async () => {
  const storage = memoryStorage();
  const lib = (await openLibrary(storage, { now: clock })).library;
  lib.keepDump(fixture('factory-SndA'), 'received');
  lib.importFile(fixture('base'), { replace: true });
  lib.importFile(odd(), { replace: true });
  const sndcs = lib.getState().dumps.filter((x) => x.type === 'one');
  assert.equal(sndcs.length, 2);
  const oldSndc = sndcs.at(-1)!;
  const sndA = lib.getState().dumps.find((x) => x.type === 'all')!;
  const plan = lib.planClearDumps();
  assert.deepEqual(plan.deleteIds, [oldSndc.id], 'the Sndc the setup no longer links to goes');
  assert.ok(plan.keepIds.includes(sndA.id) && plan.keepIds.includes(sndcs[0]!.id));
  const canUndo = lib.getState().canUndo;
  const r = lib.clearOldDumps();
  assert.match(r.message!, /^Cleared 1 dump;/);
  const after = lib.getState().dumps;
  assert.equal(after.length, plan.keepIds.length);
  assert.ok(after.every((x) => x.hidden === true), 'everything kept is hidden');
  assert.deepEqual(after.find((x) => x.id === sndA.id)!.keptFor!.backup, true);
  assert.deepEqual(after.find((x) => x.id === sndcs[0]!.id)!.keptFor!.setups.map((n) => n.slot), [16]);
  assert.equal(lib.getState().canUndo, canUndo);
  await lib.whenSaved();
  assert.deepEqual(storage.dumps().map((x) => x.hidden), after.map(() => true));
  assert.equal(lib.clearOldDumps().message, 'There are no old dumps to clear.');
});

test('library: the hidden mark survives save and load; an old stored dump without it is visible', async () => {
  const storage = memoryStorage();
  const lib = (await openLibrary(storage, { now: clock })).library;
  lib.keepDump(fixture('factory-SndA'), 'received');
  assert.equal(lib.getState().dumps[0]!.hidden, undefined, 'a new dump is visible');
  await lib.whenSaved();
  assert.equal(storage.dumps()[0]!.hidden, undefined, 'stored like an old library: no mark');
  lib.clearOldDumps();
  await lib.whenSaved();
  const again = (await openLibrary(storage, { now: clock })).library.getState().dumps;
  assert.deepEqual(again.map((x) => [x.hidden, x.keptFor?.backup]), [[true, true]]);
});

test('library: a dump that arrives after a clear is visible, also a kept one that comes again', async () => {
  const lib = (await openLibrary(memoryStorage(), { now: clock })).library;
  lib.keepDump(fixture('factory-SndA'), 'received');
  lib.clearOldDumps();
  lib.importFile(fixture('base'), { replace: true });
  const [fresh, hidden] = lib.getState().dumps;
  assert.equal(fresh!.hidden, undefined);
  assert.equal(hidden!.hidden, true);
  lib.keepDump(fixture('factory-SndA'), 'received');
  assert.ok(lib.getState().dumps.every((x) => x.hidden === undefined), 'the same bytes received again are visible again');
});

test('library: the same bytes imported again while hidden: visible, saved, duplicate', async () => {
  const storage = memoryStorage();
  const lib = (await openLibrary(storage, { now: clock })).library;
  lib.keepDump(fixture('factory-SndA'), 'received');
  lib.clearOldDumps();
  assert.equal(lib.getState().dumps[0]!.hidden, true);
  const r = lib.keepDump(fixture('factory-SndA'), 'file', 'again.syx');
  assert.ok(r.status === 'kept' && r.duplicateOf);
  assert.equal(lib.getState().dumps.length, 1);
  assert.equal(lib.getState().dumps[0]!.hidden, undefined);
  await lib.whenSaved();
  assert.equal(storage.dumps()[0]!.hidden, undefined);
});

test('library: after a clear Restore and the send still find their backup', async () => {
  const lib = (await openLibrary(memoryStorage(), { now: clock })).library;
  const t0 = Date.now() - 1000;
  lib.keepDump(fixture('factory-SndA'), 'received');
  const before = lib.planSend(16, { connectedAt: t0 });
  lib.clearOldDumps();
  const after = lib.planSend(16, { connectedAt: t0 });
  assert.ok(before.ok && after.ok);
  if (before.ok && after.ok) assert.deepEqual(after.backup, before.backup);
});

test('library: an old dump a setup still links to stays (hidden) after clearing', async () => {
  const lib = (await openLibrary(memoryStorage(), { now: clock })).library;
  lib.importFile(fixture('base'), { replace: true });
  lib.importFile(odd(), { replace: true });
  lib.undo(); // the link goes back to the first Sndc
  const linked = lib.getState().dumpLinks[lib.getState().configuration.setups.find((x) => x.slot === 16)!.id]!;
  const plan = lib.planClearDumps();
  assert.ok(plan.keepIds.includes(linked) && !plan.deleteIds.includes(linked));
  lib.clearOldDumps();
  assert.deepEqual(lib.getState().dumps.map((x) => x.id), [linked]);
});

test('send-backup: a SndA a send names is needed by the setup of that slot, beside a revert need', () => {
  const dumps = [{ id: 'a', date: '2026-11-18T10:00:00Z', type: 'all' as const, slots: [1, 2] }];
  const setups = [{ id: 's', name: 'Hand made', slot: 2 }];
  const needs = dumpNeeds(dumps, { s: { dump: 'a', slot: 2 } }, setups, new Set(), { 2: 'a' });
  assert.deepEqual(needs['a']!.map((n) => [n.setupId, n.reasons]), [['s', ['send-backup', 'revert']]]);
});

test('send-backup: the need stays when no setup holds the slot', () => {
  const dumps = [{ id: 'a', date: '2026-11-18T10:00:00Z', type: 'all' as const, slots: [1] }];
  const needs = dumpNeeds(dumps, {}, [], new Set(), { 5: 'a' });
  assert.deepEqual(needs['a']!.map((n) => [n.setupId, n.slot, n.reasons]), [['', 5, ['send-backup']]]);
  assert.equal(planClearOldDumps([...dumps, { id: 'b', date: '2026-11-19T10:00:00Z', type: 'all' as const, slots: [1] }], needs).entries.find((e) => e.id === 'a')!.action, 'keep');
});
