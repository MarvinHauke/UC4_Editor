// Resolve through the library (plan 0008 step 14, decision 32): one undo step, selection moves with it.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { openLibrary, memoryStorage } from '../../src/storage/index.ts';
import { entriesOf } from '../../src/model/index.ts';
import type { ControlAddress, Library } from '../../src/storage/index.ts';

const open = async (): Promise<Library> => (await openLibrary(memoryStorage(), { now: () => new Date('2026-11-27T10:00:00Z') })).library;
const SE01 = 'factory-se01';
const enc = (group: number, index: number): ControlAddress => ({ setupId: SE01, area: 'encoders', group, index });
const fad = (group: number, index: number): ControlAddress => ({ setupId: SE01, area: 'faders', group, index });
const numberOf = (lib: Library, a: ControlAddress): number => {
  const s = lib.getState().configuration.setups[0]!;
  return a.area === 'encoders' ? s.encoderGroups[a.group]!.encoders[a.index]!.number : s.faderButtonGroups[a.group]!.faders[a.index]!.number;
};
const se01 = (lib: Library) => lib.getState().warnings.filter((w) => w.setupId === SE01);

test('a factory collision: both sides suggested; resolving one control is one undo step and selects it', async () => {
  const lib = await open();
  const w = se01(lib).find((x) => x.message.startsWith('Enc1 · EG4 and FAd1'))!;
  assert.equal(w.state, 'factory');
  const s = lib.suggest(w);
  assert.equal(s.sideBySide, true);
  assert.deepEqual(s.choices.map((c) => [c.short, c.suggestion?.text]), [['Enc1', 'CC 70'], ['FAd1', 'CC 70']]);
  const r = lib.resolve(w, 1); // change the fader
  assert.equal(r.message, 'FAd1 · FG1 now sends CC 70.');
  assert.deepEqual(r.changed, { address: fad(0, 0), properties: ['number'] });
  assert.equal(numberOf(lib, fad(0, 0)), 70);
  assert.equal(numberOf(lib, enc(3, 0)), 32);
  const sel = lib.getState().selection;
  assert.deepEqual([sel.setupId, sel.faderButtonGroup, sel.control], [SE01, 0, { area: 'faders', index: 0 }]);
  assert.equal(se01(lib).length, 7);
  lib.undo();
  assert.equal(numberOf(lib, fad(0, 0)), 32);
  assert.equal(lib.getState().selection.control, null);
  assert.equal(se01(lib).length, 8);
  lib.redo();
  assert.equal(numberOf(lib, fad(0, 0)), 70);
});

test('an open warning: the changed control first, "instead" second; choice 1 changes the other', async () => {
  const lib = await open();
  lib.setProperty(enc(0, 0), 'number', 40); // collides with FAd1 · FG2
  const w = se01(lib).find((x) => x.state === 'open')!;
  const s = lib.suggest(w);
  assert.equal(s.sideBySide, false);
  assert.deepEqual(s.choices.map((c) => [c.short, c.suggestion?.text]), [['Enc1', 'CC 70'], ['FAd1', 'CC 70']]);
  const r = lib.resolve(w);
  assert.equal(numberOf(lib, enc(0, 0)), 70);
  assert.deepEqual(r.changed?.properties, ['number']);
  assert.equal(se01(lib).some((x) => x.state === 'open'), false);
});

test('a problem: the nearest valid value, one undo step', async () => {
  const lib = await open();
  // a bad file is the only way to get a problem; import one with upper 200
  const state = lib.getState();
  const bad = structuredClone(state.configuration);
  bad.setups[0]!.encoderGroups[0]!.encoders[0]!.upper = 200;
  lib.importFile(JSON.stringify(bad));
  const p = lib.getState().problems[0]!;
  assert.ok(p);
  const r = lib.resolve(p);
  assert.equal(r.state.configuration.setups[0]!.encoderGroups[0]!.encoders[0]!.upper, 127);
  assert.equal(r.state.problems.length, 0);
  lib.undo();
  assert.equal(lib.getState().configuration.setups[0]!.encoderGroups[0]!.encoders[0]!.upper, 200);
});

test('a stale or empty choice is refused with a reason and changes nothing', async () => {
  const lib = await open();
  lib.setProperty(enc(0, 0), 'number', 40);
  const w = se01(lib).find((x) => x.state === 'open')!;
  lib.setProperty(enc(0, 0), 'number', 9); // no longer a warning
  const before = lib.getState().configuration;
  const r = lib.resolve(w);
  assert.ok(r.message);
  assert.equal(r.changed, undefined);
  assert.equal(lib.getState().configuration, before);
  assert.equal(lib.suggest(w).choices.length, 0);
  assert.ok(lib.resolve({ path: 'format', message: 'x' }).message);
});

// --- the plan (decision 35, step 17) ---
const factoryWarnings = (lib: Library) => se01(lib).filter((w) => w.state === 'factory');

test('suggest with a plan: a planned number is reserved, so the next row moves on', async () => {
  const lib = await open();
  const [w0, w1] = factoryWarnings(lib);
  const first = lib.suggest(w0!).choices[0]!;
  assert.equal(first.suggestion!.text, 'CC 70');
  const plan = entriesOf(lib.getState().configuration, first);
  assert.equal(lib.suggest(w1!, plan).choices[0]!.suggestion!.text, 'CC 71');
  assert.equal(lib.suggest(w1!).choices[0]!.suggestion!.text, 'CC 70'); // no plan: unchanged
});

test('applyPlan: the whole plan is one undo step; it reports what changed', async () => {
  const lib = await open();
  const cfg = lib.getState().configuration;
  const plan = [
    ...entriesOf(cfg, lib.suggest(factoryWarnings(lib)[0]!).choices[0]!),
    { path: 'setups[0].faderButtonGroups[0].faders[1]', property: 'number' as const, before: 33, after: 71 },
  ];
  const r = lib.applyPlan(plan);
  assert.equal(r.message, '2 changes applied.');
  assert.deepEqual(r.refused, []);
  assert.deepEqual(r.changed, [
    { address: enc(3, 0), properties: ['number'] },
    { address: fad(0, 1), properties: ['number'] },
  ]);
  assert.equal(numberOf(lib, enc(3, 0)), 70);
  assert.equal(numberOf(lib, fad(0, 1)), 71);
  lib.undo();
  assert.equal(numberOf(lib, enc(3, 0)), 32);
  assert.equal(numberOf(lib, fad(0, 1)), 33);
  assert.equal(lib.getState().canUndo, false);
  lib.redo();
  assert.equal(numberOf(lib, fad(0, 1)), 71);
});

test('applyPlan groups the entries of one control: channel and number together', async () => {
  const lib = await open();
  const path = 'setups[0].encoderGroups[3].encoders[0]';
  const r = lib.applyPlan([
    { path, property: 'channel', before: 1, after: 2 },
    { path, property: 'number', before: 32, after: 5 },
  ]);
  assert.equal(r.message, '2 changes applied.');
  assert.deepEqual(r.changed, [{ address: enc(3, 0), properties: ['channel', 'number'] }]);
  const c = lib.getState().configuration.setups[0]!.encoderGroups[3]!.encoders[0]!;
  assert.deepEqual([c.channel, c.number], [2, 5]);
});

test('applyPlan refuses a stale entry with the reason and applies the rest; nothing applied is no step', async () => {
  const lib = await open();
  const stale = { path: 'setups[0].encoderGroups[3].encoders[0]', property: 'number' as const, before: 99, after: 70 };
  const good = { path: 'setups[0].encoderGroups[3].encoders[1]', property: 'number' as const, before: 33, after: 71 };
  const r = lib.applyPlan([stale, good]);
  assert.deepEqual(r.refused.map((x) => x.entry), [stale]);
  assert.ok(r.refused[0]!.reason.includes('now'));
  assert.equal(numberOf(lib, enc(3, 1)), 71);
  assert.equal(numberOf(lib, enc(3, 0)), 32);
  const none = lib.applyPlan([stale]);
  assert.equal(none.changed, undefined);
  assert.ok(none.message);
  assert.deepEqual(none.refused.map((x) => x.entry), [stale]);
  assert.equal(lib.applyPlan([]).changed, undefined);
  lib.undo(); // the one step of the good entry
  assert.equal(lib.getState().canUndo, false);
});

test('applyPlan drops the mark of a field it fixes, and the problem with it', async () => {
  const lib = await open();
  const bad = structuredClone(lib.getState().configuration);
  bad.setups[0]!.encoderGroups[0]!.encoders[0]!.upper = 200;
  lib.importFile(JSON.stringify(bad));
  assert.equal(lib.getState().problems.length > 0, true);
  const r = lib.applyPlan([{ path: 'setups[0].encoderGroups[0].encoders[0]', property: 'upper', before: 200, after: 127 }]);
  assert.equal(r.refused.length, 0);
  assert.deepEqual(r.changed, [{ address: enc(0, 0), properties: ['upper'] }]);
  assert.equal(lib.getState().problems.length, 0);
});
