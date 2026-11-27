// Resolve through the library (plan 0008 step 14, decision 32): one undo step, selection moves with it.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { openLibrary, memoryStorage } from '../../src/storage/index.ts';
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
  assert.deepEqual(s.choices.map((c) => [c.short, c.suggestion?.text]), [['Enc1', 'CC 64'], ['FAd1', 'CC 64']]);
  const r = lib.resolve(w, 1); // change the fader
  assert.equal(r.message, 'FAd1 · FG1 now sends CC 64.');
  assert.deepEqual(r.changed, { address: fad(0, 0), properties: ['number'] });
  assert.equal(numberOf(lib, fad(0, 0)), 64);
  assert.equal(numberOf(lib, enc(3, 0)), 32);
  const sel = lib.getState().selection;
  assert.deepEqual([sel.setupId, sel.faderButtonGroup, sel.control], [SE01, 0, { area: 'faders', index: 0 }]);
  assert.equal(se01(lib).length, 7);
  lib.undo();
  assert.equal(numberOf(lib, fad(0, 0)), 32);
  assert.equal(lib.getState().selection.control, null);
  assert.equal(se01(lib).length, 8);
  lib.redo();
  assert.equal(numberOf(lib, fad(0, 0)), 64);
});

test('an open warning: the changed control first, "instead" second; choice 1 changes the other', async () => {
  const lib = await open();
  lib.setProperty(enc(0, 0), 'number', 40); // collides with FAd1 · FG2
  const w = se01(lib).find((x) => x.state === 'open')!;
  const s = lib.suggest(w);
  assert.equal(s.sideBySide, false);
  assert.deepEqual(s.choices.map((c) => [c.short, c.suggestion?.text]), [['Enc1', 'CC 64'], ['FAd1', 'CC 64']]);
  const r = lib.resolve(w);
  assert.equal(numberOf(lib, enc(0, 0)), 64);
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
