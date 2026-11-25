// What a kept dump is needed for and "Clear old dumps" (plan 0005 step 6, decisions 10 and 15).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openLibrary, memoryStorage } from '../../src/storage/index.ts';
import { dumpNeeds, planClearOldDumps } from '../../src/storage/keptDumpPlan.ts';
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

test('plan: keeps the newest SndA and the newest Sndc per slot, deletes the rest, says why', () => {
  const dumps = [
    d('a1', '2026-01-01', 'all', all(18)), d('a2', '2026-01-03', 'all', all(18)),
    d('c5a', '2026-01-02', 'one', [5]), d('c5b', '2026-01-04', 'one', [5]), d('c6', '2026-01-01', 'one', [6]),
  ];
  const p = planClearOldDumps(dumps, {});
  assert.deepEqual(p.entries.map((e) => e.id), ['c5b', 'a2', 'c5a', 'a1', 'c6'], 'newest first');
  assert.deepEqual(p.deleteIds, ['c5a', 'a1']);
  assert.deepEqual(p.keepIds, ['c5b', 'a2', 'c6']);
  const old = p.entries.find((e) => e.id === 'c5a')!;
  assert.deepEqual([old.kind, old.supersededBy, old.keepBecause], ['Sndc SE05', 'c5b', []]);
  assert.deepEqual(p.entries.find((e) => e.id === 'c6')!.keepBecause, ['newest']);
});

test('plan: an older dump a setup needs stays, with the reason', () => {
  const dumps = [d('a1', '2026-01-01', 'all', all(18)), d('a2', '2026-01-03', 'all', all(18))];
  const needs = dumpNeeds(dumps, { s1: { dump: 'a1', slot: 1 } }, [{ id: 's1', name: 'One', slot: 1 }]);
  const p = planClearOldDumps(dumps, needs);
  assert.deepEqual(p.deleteIds, []);
  const e = p.entries.find((x) => x.id === 'a1')!;
  assert.deepEqual([e.action, e.keepBecause, e.neededBy[0]!.setupName], ['keep', ['needed'], 'One']);
  assert.deepEqual(p.entries.find((x) => x.id === 'a2')!.keepBecause, ['newest']);
});

test('plan: unreadable dumps count as one kind: the newest stays', () => {
  const p = planClearOldDumps([d('u1', '2026-01-01', 'unknown', []), d('u2', '2026-01-02', 'unknown', [])], {});
  assert.deepEqual(p.keepIds, ['u2']);
  assert.deepEqual(p.deleteIds, ['u1']);
  assert.equal(p.entries[1]!.kind, 'unreadable dump');
});

test('plan: nothing to clear gives an empty delete list', () => {
  assert.deepEqual(planClearOldDumps([], {}).deleteIds, []);
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

test('library: clearOldDumps deletes what the plan lists, saves it, is not an undo step', async () => {
  const storage = memoryStorage();
  const lib = (await openLibrary(storage, { now: clock })).library;
  lib.importFile(fixture('factory-SndA'));
  lib.importFile(fixture('base'), { replace: true });
  assert.deepEqual(lib.planClearDumps().deleteIds, [], 'one SndA and one Sndc: nothing old');
  assert.equal(lib.clearOldDumps().message, 'There are no old dumps to clear.');
  lib.importFile(odd(), { replace: true });
  const sndcs = lib.getState().dumps.filter((x) => x.type === 'one');
  assert.equal(sndcs.length, 2);
  const oldSndc = sndcs.at(-1)!;
  const plan = lib.planClearDumps();
  assert.deepEqual(plan.deleteIds, [oldSndc.id], 'the Sndc the setup no longer links to is old');
  const canUndo = lib.getState().canUndo;
  const r = lib.clearOldDumps();
  assert.equal(r.message, 'Cleared 1 old dump.');
  assert.equal(lib.getState().dumps.length, 2);
  assert.equal(lib.getState().canUndo, canUndo);
  await lib.whenSaved();
  assert.equal(storage.dumps().length, 2);
  assert.deepEqual(lib.planClearDumps().deleteIds, []);
});

test('library: an old dump a setup still links to stays after clearing', async () => {
  const lib = (await openLibrary(memoryStorage(), { now: clock })).library;
  lib.importFile(fixture('base'), { replace: true });
  lib.importFile(odd(), { replace: true });
  lib.undo(); // the link goes back to the first Sndc
  const linked = lib.getState().dumpLinks[lib.getState().configuration.setups.find((x) => x.slot === 16)!.id]!;
  const plan = lib.planClearDumps();
  assert.ok(!plan.deleteIds.includes(linked));
  assert.deepEqual(plan.deleteIds, [], 'the newer Sndc is the newest, the older one is needed');
  lib.clearOldDumps();
  assert.equal(lib.getState().dumps.length, 2);
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
