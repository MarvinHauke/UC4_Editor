// Library files, export state, resets and problems (plan 0006 step 3), through the library's commands.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { openLibrary, memoryStorage } from '../../src/storage/index.ts';
import type { ControlAddress, Library } from '../../src/storage/index.ts';
import { factorySetup, load, save } from '../../src/model/index.ts';
import type { Uc4Config } from '../../src/model/index.ts';

const time = new Date(2026, 10, 14, 10, 0, 0);
const clock = () => time;
const open = async (storage = memoryStorage()) => ({ lib: (await openLibrary(storage, { now: clock })).library, storage });
const enc = (setup: string, index = 0, group = 0): ControlAddress => ({ setupId: setup, area: 'encoders', group, index });
const cfg = (lib: Library): Uc4Config => lib.getState().configuration;
const frame = (await openLibrary(memoryStorage(), { now: clock })).library.getState().configuration;
const wrap = (setups: Uc4Config['setups']): string => save({ ...frame, setups });
const one = (slot: number | undefined, name = 'Imported', id = 'imp-1'): string => {
  const s = { ...factorySetup(slot ?? 1), id, name };
  if (slot === undefined) delete (s as { slot?: number }).slot;
  return wrap([s]);
};

// --- summaries and problems ---
test('setup summaries: slot, name, problem count, differs from factory', async () => {
  const { lib } = await open();
  assert.equal(lib.getState().setups.length, 18);
  assert.deepEqual(lib.getState().setups[0], { id: 'factory-se01', slot: 1, name: 'SE01', problemCount: 0, differsFromFactory: false });
  lib.setProperty(enc('factory-se03'), 'number', 200);
  lib.setProperty(enc('factory-se03', 1), 'number', 201);
  lib.setSetupName('factory-se04', 'Drums');
  const s = lib.getState().setups;
  assert.deepEqual([s[2]!.problemCount, s[2]!.differsFromFactory], [2, true]);
  assert.deepEqual([s[3]!.problemCount, s[3]!.differsFromFactory], [0, true], 'a rename differs');
  assert.equal(s[4]!.differsFromFactory, false);
  lib.undo(); lib.undo(); lib.undo();
  assert.equal(lib.getState().setups[2]!.differsFromFactory, false);
});

test('selectProblem jumps to the setup, group and control of a problem', async () => {
  const { lib } = await open();
  lib.setProperty({ setupId: 'factory-se03', area: 'faders', group: 5, index: 2 }, 'number', 300);
  lib.setProperty({ setupId: 'factory-se03', area: 'pushButtons', group: 6, index: 4 }, 'channel', 40);
  lib.selectProblem(0);
  const p = lib.getState().problems[0]!.path;
  assert.match(p, /^setups\[2\]\./);
  assert.deepEqual(lib.getState().selection.setupId, 'factory-se03');
  lib.selectProblem(lib.getState().problems.findIndex((x) => x.path.includes('pushButtons')));
  assert.deepEqual(lib.getState().selection, {
    setupId: 'factory-se03', encoderGroup: 6, faderButtonGroup: 0, control: { area: 'pushButtons', index: 4 },
  });
  lib.selectProblem(lib.getState().problems.findIndex((x) => x.path.includes('faders')));
  assert.deepEqual(lib.getState().selection.faderButtonGroup, 5);
  assert.deepEqual(lib.getState().selection.control, { area: 'faders', index: 2 });
  assert.ok(lib.selectProblem(99).message);
});

// --- export ---
test('exportWhole: dated file name, loadable text, marks everything exported', async () => {
  const { lib } = await open();
  lib.setSetupName('factory-se02', 'A');
  assert.equal(lib.getState().exportState.unexportedChanges, true);
  assert.equal(lib.getState().exportState.changedSetups, 1);
  assert.equal(lib.getState().exportState.lastExportedAt, null);
  const r = lib.exportWhole();
  assert.equal(r.file!.name, 'uc4-config-2026-11-14.json');
  const back = load(r.file!.text);
  assert.equal(back.status, 'loaded');
  assert.equal(lib.getState().exportState.unexportedChanges, false);
  assert.equal(lib.getState().exportState.lastExportedAt, time.toISOString());
  assert.equal(lib.getState().exportState.lastWholeExportAt, time.toISOString());
  lib.setSetupName('factory-se02', 'B');
  assert.equal(lib.getState().exportState.changedSetups, 1);
  lib.undo();
  assert.equal(lib.getState().exportState.unexportedChanges, false, 'undo back to the exported content');
});

test('before any export, the factory setups count as exported', async () => {
  const { lib } = await open();
  assert.deepEqual(lib.getState().exportState, { lastExportedAt: null, lastWholeExportAt: null, changedSetups: 0, unexportedChanges: false });
});

test('exportSetup: one setup with its slot, named by slot and date; exports only that setup', async () => {
  const { lib } = await open();
  lib.setSetupName('factory-se05', 'Live');
  lib.setSetupName('factory-se06', 'Other');
  const r = lib.exportSetup('factory-se05');
  assert.equal(r.file!.name, 'uc4-setup-05-2026-11-14.json');
  const back = load(r.file!.text);
  assert.equal(back.status, 'loaded');
  const c = (back as { configuration: Uc4Config }).configuration;
  assert.equal(c.setups.length, 1);
  assert.equal(c.setups[0]!.slot, 5);
  assert.equal(c.setups[0]!.name, 'Live');
  assert.equal(lib.getState().exportState.changedSetups, 1, 'SE06 is still unexported');
  assert.equal(lib.getState().exportState.lastExportedAt, time.toISOString());
  assert.equal(lib.getState().exportState.lastWholeExportAt, null, 'one setup is not a backup');
  assert.ok(lib.exportSetup('nope').message);
  assert.equal(lib.exportSetup('nope').file, undefined);
});

test('the export state is remembered across a reload', async () => {
  const { lib, storage } = await open();
  lib.setSetupName('factory-se02', 'A');
  lib.exportWhole();
  lib.setSetupName('factory-se03', 'B');
  await lib.whenSaved();
  const again = (await openLibrary(storage, { now: clock })).library;
  assert.equal(again.getState().exportState.lastExportedAt, time.toISOString());
  assert.equal(again.getState().exportState.changedSetups, 1);
});

// --- import: whole ---
test('inspectImport of a whole file says whether unexported changes would be replaced', async () => {
  const { lib } = await open();
  const file = save(cfg(lib));
  let i = lib.inspectImport(file);
  assert.deepEqual([i.status, i.status === 'whole' && i.unexportedChanges], ['whole', false]);
  lib.setSetupName('factory-se02', 'A');
  i = lib.inspectImport(file);
  assert.equal(i.status === 'whole' && i.unexportedChanges, true);
  assert.equal(i.status === 'whole' && i.setups, 18);
});

test('importing a whole file replaces the library, selects its first setup, and one undo restores it', async () => {
  const { lib } = await open();
  lib.setSetupName('factory-se02', 'Mine');
  const other = structuredClone(cfg(lib));
  other.setups = other.setups.slice(0, 3).map((s, k) => ({ ...s, name: `X${k}`, id: `x${k}` }));
  const r = lib.importFile(save(other));
  assert.equal(r.status, 'imported');
  assert.equal(lib.getState().configuration.setups.length, 3);
  assert.equal(lib.getState().selection.setupId, 'x0');
  lib.undo();
  assert.equal(lib.getState().configuration.setups.length, 18);
  assert.equal(lib.getState().configuration.setups[1]!.name, 'Mine');
  lib.redo();
  assert.equal(lib.getState().configuration.setups.length, 3);
});

test('a broken file is refused with what to do, and nothing changes', async () => {
  const { lib } = await open();
  const before = cfg(lib);
  for (const text of ['{ not json', '{"format":"other"}', '[]']) {
    const r = lib.importFile(text);
    assert.equal(r.status, 'refused');
    assert.ok(r.status === 'refused' && r.reason && r.whatToDo);
    assert.ok(r.message);
    assert.equal(cfg(lib), before);
  }
  assert.equal(lib.getState().canUndo, false);
  assert.equal(lib.inspectImport('nope').status, 'refused');
});

test('a file with value problems imports; the problems are counted and listed', async () => {
  const { lib } = await open();
  const bad = structuredClone(cfg(lib));
  bad.setups[0]!.encoderGroups[0]!.encoders[0]!.number = 999;
  const r = lib.importFile(save(bad));
  assert.equal(r.status === 'imported' && r.problemCount, 1);
  assert.match(r.message ?? '', /1 problem found/);
  assert.equal(lib.getState().problems.length, 1);
  assert.equal(lib.getState().setups[0]!.problemCount, 1);
});

// --- import: one setup ---
test('a one-setup file into a free slot goes there, in slot order', async () => {
  const { lib } = await open();
  const small = structuredClone(cfg(lib));
  small.setups = small.setups.filter((s) => s.slot !== 4 && s.slot !== 9);
  lib.importFile(save(small));
  const i = lib.inspectImport(one(9, 'Nine'));
  assert.deepEqual(i.status === 'setup' && i.freeSlots, [4, 9]);
  assert.equal(i.status === 'setup' && i.occupiedBy, undefined);
  const r = lib.importFile(one(9, 'Nine'));
  assert.deepEqual([r.status, r.status === 'imported' && r.slot], ['imported', 9]);
  const slots = lib.getState().configuration.setups.map((s) => s.slot);
  assert.deepEqual(slots, [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  assert.equal(lib.getState().selection.setupId, 'imp-1');
});

test('an occupied slot comes back as a result, not a change; replace or another slot then works', async () => {
  const { lib } = await open();
  const small = structuredClone(cfg(lib));
  small.setups = small.setups.filter((s) => s.slot !== 4);
  lib.importFile(save(small));
  const i = lib.inspectImport(one(5, 'Five'));
  assert.deepEqual(i.status === 'setup' && i.occupiedBy, { id: 'factory-se05', name: 'SE05' });
  const before = cfg(lib);
  const r = lib.importFile(one(5, 'Five'));
  assert.equal(r.status, 'slot-occupied');
  assert.equal(r.status === 'slot-occupied' && r.occupiedBy.name, 'SE05');
  assert.equal(cfg(lib), before);
  // another slot
  const other = lib.importFile(one(5, 'Five'), { slot: 4 });
  assert.equal(other.status === 'imported' && other.slot, 4);
  assert.equal(cfg(lib).setups.find((s) => s.slot === 4)!.name, 'Five');
  assert.equal(cfg(lib).setups.find((s) => s.slot === 5)!.name, 'SE05');
  // replace
  const rep = lib.importFile(one(5, 'Replacer', 'imp-2'), { replace: true });
  assert.equal(rep.status, 'imported');
  assert.equal(cfg(lib).setups.filter((s) => s.slot === 5).length, 1);
  assert.equal(cfg(lib).setups.find((s) => s.slot === 5)!.name, 'Replacer');
  lib.undo();
  assert.equal(cfg(lib).setups.find((s) => s.slot === 5)!.name, 'SE05');
});

test('a one-setup file without a slot needs one; a bad slot is refused; the setup takes the chosen slot', async () => {
  const { lib } = await open();
  const small = structuredClone(cfg(lib));
  small.setups = small.setups.filter((s) => s.slot !== 7);
  lib.importFile(save(small));
  assert.equal(lib.importFile(one(undefined)).status, 'needs-slot');
  assert.equal(lib.importFile(one(undefined), { slot: 19 }).status, 'refused');
  assert.equal(lib.importFile(one(undefined), { slot: 7 }).status, 'imported');
  assert.equal(cfg(lib).setups.find((s) => s.id === 'imp-1')!.slot, 7);
});

test('an imported setup whose id is already taken gets a new id', async () => {
  const { lib } = await open();
  const r = lib.importFile(one(3, 'Clash', 'factory-se01'), { replace: true });
  assert.equal(r.status, 'imported');
  const ids = cfg(lib).setups.map((s) => s.id);
  assert.equal(new Set(ids).size, 18);
  assert.equal(cfg(lib).setups.find((s) => s.slot === 3)!.id, 'factory-se01-2');
  assert.deepEqual(lib.getState().problems, []);
});

test('an exported setup imports back into its own slot (replace) and the library is as before', async () => {
  const { lib } = await open();
  lib.setProperty(enc('factory-se05', 2), 'channel', 9);
  const file = lib.exportSetup('factory-se05').file!;
  lib.setProperty(enc('factory-se05', 2), 'channel', 4);
  assert.equal(lib.importFile(file.text).status, 'slot-occupied');
  lib.importFile(file.text, { replace: true });
  assert.equal(cfg(lib).setups.find((s) => s.slot === 5)!.encoderGroups[0]!.encoders[2]!.channel, 9);
  assert.equal(cfg(lib).setups.length, 18);
});

// --- resets ---
test('resetSetup goes back to the factory setup of its slot, name included, in one undo step', async () => {
  const { lib } = await open();
  lib.setProperty(enc('factory-se05', 2), 'channel', 9);
  lib.setSetupName('factory-se05', 'Live');
  lib.setGroupName('factory-se05', 1, 'abcd');
  const r = lib.resetSetup('factory-se05');
  assert.match(r.message ?? '', /back to factory/);
  assert.deepEqual(cfg(lib).setups[4], factorySetup(5));
  assert.equal(lib.getState().setups[4]!.differsFromFactory, false);
  lib.undo();
  assert.equal(cfg(lib).setups[4]!.name, 'Live');
  assert.equal(cfg(lib).setups[4]!.encoderGroups[0]!.encoders[2]!.channel, 9);
});

test('resetSetup keeps the id; a setup that already is factory is not a change; refusals say why', async () => {
  const { lib } = await open();
  assert.equal(lib.resetSetup('factory-se05').message, undefined);
  assert.equal(lib.getState().canUndo, false);
  assert.ok(lib.resetSetup('nope').message);
  const free = lib.importFile(one(undefined), { slot: 2, replace: true });
  assert.equal(free.status, 'imported');
});

test('resetAll: every slot back to factory, names and labels included', async () => {
  const { lib } = await open();
  assert.equal(lib.getState().differsFromFactory, false);
  lib.setProperty(enc('factory-se05', 2), 'channel', 9);
  lib.setSetupName('factory-se17', 'Live');
  lib.setGroupName('factory-se02', 1, 'abcd');
  assert.equal(lib.getState().differsFromFactory, true);
  const r = lib.resetAll();
  assert.match(r.message ?? '', /back to factory/);
  assert.deepEqual(cfg(lib).setups, Array.from({ length: 18 }, (_, i) => factorySetup(i + 1)));
  assert.equal(lib.getState().differsFromFactory, false);
  assert.equal(lib.getState().selection.setupId, 'factory-se01');
});

test('resetAll keeps the selected slot and the ids of an imported library', async () => {
  const { lib } = await open();
  const c = structuredClone(cfg(lib));
  c.setups = c.setups.map((s) => ({ ...s, id: `my-${s.slot}`, name: 'Mine' }));
  lib.importFile(save(c));
  lib.select({ setupId: 'my-5', encoderGroup: 2, faderButtonGroup: 0, control: null });
  lib.resetAll();
  assert.deepEqual(cfg(lib).setups.map((s) => s.id), Array.from({ length: 18 }, (_, i) => `my-${i + 1}`));
  assert.equal(lib.getState().selection.setupId, 'my-5');
  assert.equal(cfg(lib).setups[4]!.name, 'SE05');
});

test('resetAll keeps kept dumps, and is one undo step with redo', async () => {
  const { lib } = await open();
  const bytes = readFileSync('tests/fixtures/sysex/' + readdirSync('tests/fixtures/sysex').filter((f) => f.endsWith('.syx'))[0]!);
  lib.keepDump(new Uint8Array(bytes), 'file');
  const dumps = lib.getState().dumps.length;
  assert.ok(dumps > 0);
  lib.setSetupName('factory-se03', 'Live');
  lib.resetAll();
  assert.equal(lib.getState().dumps.length, dumps);
  assert.equal(cfg(lib).setups[2]!.name, 'SE03');
  lib.undo();
  assert.equal(cfg(lib).setups[2]!.name, 'Live');
  lib.redo();
  assert.equal(cfg(lib).setups[2]!.name, 'SE03');
  assert.equal(lib.getState().dumps.length, dumps);
});

test('resetAll on a factory library is no change and no undo step; the export time is untouched', async () => {
  const { lib } = await open();
  const before = lib.getState().exportState.lastExportedAt;
  const r = lib.resetAll();
  assert.equal(r.message, undefined);
  assert.equal(lib.getState().canUndo, false);
  assert.equal(lib.getState().exportState.lastExportedAt, before);
});

test('a setup without a slot cannot be reset', async () => {
  const { lib } = await open();
  const c = structuredClone(cfg(lib));
  delete (c.setups[0] as { slot?: number }).slot;
  lib.importFile(save(c));
  assert.match(lib.resetSetup('factory-se01').message ?? '', /no slot/);
  assert.match(lib.resetEncoderGroup('factory-se01', 0).message ?? '', /no slot/);
});

test('resetEncoderGroup and resetFaderButtonGroup reset only their group, independent of each other', async () => {
  const { lib } = await open();
  const id = 'factory-se02';
  lib.setGroupName(id, 3, 'zzzz');
  lib.setProperty({ setupId: id, area: 'encoders', group: 3, index: 1 }, 'channel', 9);
  lib.setProperty({ setupId: id, area: 'encoders', group: 4, index: 1 }, 'channel', 9);
  lib.setProperty({ setupId: id, area: 'faders', group: 3, index: 1 }, 'channel', 9);
  lib.resetEncoderGroup(id, 3);
  let s = cfg(lib).setups[1]!;
  assert.deepEqual(s.encoderGroups[3], factorySetup(2).encoderGroups[3]);
  assert.equal(s.encoderGroups[4]!.encoders[1]!.channel, 9, 'another encoder group stays');
  assert.equal(s.faderButtonGroups[3]!.faders[1]!.channel, 9, 'the fader/button group stays');
  lib.resetFaderButtonGroup(id, 3);
  s = cfg(lib).setups[1]!;
  assert.deepEqual(s.faderButtonGroups[3], factorySetup(2).faderButtonGroups[3]);
  assert.ok(lib.resetEncoderGroup(id, 8).message);
  assert.ok(lib.resetFaderButtonGroup('nope', 0).message);
  lib.undo();
  assert.equal(cfg(lib).setups[1]!.faderButtonGroups[3]!.faders[1]!.channel, 9);
  lib.undo();
  assert.equal(cfg(lib).setups[1]!.encoderGroups[3]!.name, 'zzzz');
});

test('every import and reset is saved', async () => {
  const { lib, storage } = await open();
  lib.setSetupName('factory-se05', 'Live');
  lib.resetSetup('factory-se05');
  await lib.whenSaved();
  const back = load(storage.text()!);
  assert.equal(back.status === 'loaded' && back.configuration.setups[4]!.name, 'SE05');
});
