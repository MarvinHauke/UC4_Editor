// The library module through its public commands (plan 0006 step 1), with the in-memory storage.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { openLibrary, memoryStorage, HISTORY_LIMIT } from '../../src/storage/index.ts';
import type { ControlAddress, Library } from '../../src/storage/index.ts';
import { changeType, factorySetup, load, save, validate } from '../../src/model/index.ts';
import type { Uc4Config } from '../../src/model/index.ts';

const clock = () => new Date('2026-11-14T10:00:00.000Z');
const open = async (storage = memoryStorage()): Promise<{ lib: Library; storage: ReturnType<typeof memoryStorage> }> => ({
  lib: (await openLibrary(storage, { now: clock })).library,
  storage,
});
const enc = (setup: string, index = 0, group = 0): ControlAddress => ({ setupId: setup, area: 'encoders', group, index });
const firstId = (lib: Library) => lib.getState().configuration.setups[0]!.id;
const stored = (storage: ReturnType<typeof memoryStorage>): Uc4Config => {
  const r = load(storage.text()!);
  assert.equal(r.status, 'loaded');
  return (r as { configuration: Uc4Config }).configuration;
};

// --- first start and stored data ---
test('first start with nothing stored: the 18 factory setups, selection on the first control, saved', async () => {
  const { lib, storage } = await open();
  const st = lib.getState();
  assert.deepEqual(st.configuration.setups, Array.from({ length: 18 }, (_, i) => factorySetup(i + 1)));
  assert.deepEqual(st.selection, { setupId: 'factory-se01', encoderGroup: 0, faderButtonGroup: 0, control: null });
  assert.deepEqual(st.problems, []);
  assert.equal(st.canUndo, false);
  assert.equal(st.canRedo, false);
  await lib.whenSaved();
  assert.equal(stored(storage).setups.length, 18);
});

test('a stored configuration comes back, through load', async () => {
  const { lib, storage } = await open();
  lib.setSetupName(firstId(lib), 'my live set');
  await lib.whenSaved();
  const again = await openLibrary(storage, { now: clock });
  assert.equal(again.library.getState().configuration.setups[0]!.name, 'my live set');
  assert.equal(again.message, undefined);
});

test('stored data that cannot be read: factory start, a message, the old text is kept aside', async () => {
  const storage = memoryStorage('{ not json');
  const opened = await openLibrary(storage, { now: clock });
  assert.equal(opened.library.getState().configuration.setups.length, 18);
  assert.match(opened.message ?? '', /could not be read/);
  assert.deepEqual(storage.quarantined(), ['{ not json']);
});

test('stored data with value problems still opens and lists the problems', async () => {
  const c = structuredClone(await open().then((o) => o.lib.getState().configuration));
  c.setups[2]!.encoderGroups[0]!.encoders[3]!.number = 200;
  const opened = await openLibrary(memoryStorage(save(c)), { now: clock });
  assert.equal(opened.library.getState().problems.length, 1);
  assert.equal(opened.library.getState().problems[0]!.path, 'setups[2].encoderGroups[0].encoders[3].number');
});

// --- select ---
test('select: setup, encoder group and fader/button group are independent; control kept or cleared', async () => {
  const { lib } = await open();
  lib.select({ encoderGroup: 3 });
  lib.select({ faderButtonGroup: 5 });
  lib.select({ control: { area: 'faders', index: 8 } });
  assert.deepEqual(lib.getState().selection, {
    setupId: 'factory-se01', encoderGroup: 3, faderButtonGroup: 5, control: { area: 'faders', index: 8 },
  });
  lib.select({ setupId: 'factory-se05' });
  assert.equal(lib.getState().selection.setupId, 'factory-se05');
  assert.equal(lib.getState().selection.encoderGroup, 3, 'groups stay when the setup changes');
});

test('select refuses what does not exist, with a message, and changes nothing', async () => {
  const { lib } = await open();
  const before = lib.getState().selection;
  for (const bad of [
    { setupId: 'nope' }, { encoderGroup: 8 }, { encoderGroup: -1 }, { faderButtonGroup: 1.5 },
    { control: { area: 'faders' as const, index: 9 } }, { control: { area: 'encoders' as const, index: 8 } },
  ]) {
    const r = lib.select(bad);
    assert.ok(r.message, JSON.stringify(bad));
    assert.deepEqual(lib.getState().selection, before);
  }
});

test('selecting is not undoable and does not save or count as a change', async () => {
  const { lib } = await open();
  lib.select({ encoderGroup: 2 });
  assert.equal(lib.getState().canUndo, false);
});

// --- set a property ---
test('setProperty changes one property of one control and nothing else', async () => {
  const { lib } = await open();
  const id = firstId(lib);
  const before = lib.getState().configuration;
  const r = lib.setProperty(enc(id, 3, 2), 'channel', 9);
  assert.equal(r.message, undefined);
  const after = lib.getState().configuration;
  assert.equal(after.setups[0]!.encoderGroups[2]!.encoders[3]!.channel, 9);
  assert.equal(before.setups[0]!.encoderGroups[2]!.encoders[3]!.channel, 1, 'the old state is not mutated');
  const expected = structuredClone(before);
  expected.setups[0]!.encoderGroups[2]!.encoders[3]!.channel = 9;
  assert.deepEqual({ ...after, updatedAt: '' }, { ...expected, updatedAt: '' });
  assert.equal(after.updatedAt, '2026-11-14T10:00:00.000Z');
});

test('setProperty works for every control kind', async () => {
  const { lib } = await open();
  const id = firstId(lib);
  lib.setProperty({ setupId: id, area: 'pushButtons', group: 1, index: 7 }, 'number', 5);
  lib.setProperty({ setupId: id, area: 'faders', group: 4, index: 8 }, 'mode', 'SnAP');
  lib.setProperty({ setupId: id, area: 'buttons', group: 7, index: 0 }, 'display', 'EXt');
  const s = lib.getState().configuration.setups[0]!;
  assert.equal(s.encoderGroups[1]!.pushButtons[7]!.number, 5);
  assert.equal(s.faderButtonGroups[4]!.faders[8]!.mode, 'SnAP');
  assert.equal(s.faderButtonGroups[7]!.buttons[0]!.display, 'EXt');
});

test('a type change goes through changeType and passes on its message (CCAh lowers the number)', async () => {
  const { lib } = await open();
  const id = firstId(lib);
  lib.setProperty(enc(id), 'number', 100);
  const r = lib.setProperty(enc(id), 'type', 'CCAh');
  assert.match(r.message ?? '', /lowered from 100 to 31/);
  const e = lib.getState().configuration.setups[0]!.encoderGroups[0]!.encoders[0]!;
  assert.equal(e.type, 'CCAh');
  assert.equal(e.number, 31);
  assert.equal(lib.getState().message, r.message);
  // one undo step undoes the type change together with the lowered number
  lib.undo();
  const back = lib.getState().configuration.setups[0]!.encoderGroups[0]!.encoders[0]!;
  assert.equal(back.type, 'CCAb');
  assert.equal(back.number, 100);
});

test('values a control cannot have are refused with a message and change nothing', async () => {
  const { lib } = await open();
  const id = firstId(lib);
  const before = lib.getState().configuration;
  const refused: [ControlAddress, string, unknown][] = [
    [{ setupId: id, area: 'faders', group: 0, index: 0 }, 'type', 'CCr1'], // a fader has no CCr1
    [enc(id), 'type', 'nope'],
    [enc(id), 'mode', 'JMP'],
    [enc(id), 'channel', Number.NaN],
    [enc(id), 'channel', 'x'],
    [enc(id), 'number', 1.5],
    [enc(id), 'bogus', 1],
    [{ setupId: id, area: 'faders', group: 0, index: 9 }, 'number', 1],
    [{ setupId: id, area: 'faders', group: 8, index: 0 }, 'number', 1],
    [enc('missing'), 'number', 1],
  ];
  for (const [addr, prop, value] of refused) {
    const r = lib.setProperty(addr, prop as 'type', value as never);
    assert.ok(r.message, `${prop}=${String(value)}`);
  }
  assert.equal(lib.getState().configuration, before);
  assert.equal(lib.getState().canUndo, false);
});

test('an out-of-range number is accepted and shows up as a problem with its path; fixing it clears it', async () => {
  const { lib } = await open();
  const id = firstId(lib);
  lib.setProperty(enc(id, 3, 0), 'number', 200);
  assert.deepEqual(lib.getState().problems.map((p) => p.path), ['setups[0].encoderGroups[0].encoders[3].number']);
  lib.setProperty(enc(id, 3, 0), 'number', 20);
  assert.deepEqual(lib.getState().problems, []);
});

test('setting the value a property already has is not a change', async () => {
  const { lib } = await open();
  const before = lib.getState();
  const r = lib.setProperty(enc(firstId(lib)), 'channel', 1);
  assert.equal(r.message, undefined);
  assert.equal(lib.getState().configuration, before.configuration);
  assert.equal(lib.getState().canUndo, false);
});

test('the label is a text property and an empty label removes it', async () => {
  const { lib } = await open();
  const id = firstId(lib);
  lib.setProperty(enc(id), 'label', 'Cutoff');
  assert.equal(lib.getState().configuration.setups[0]!.encoderGroups[0]!.encoders[0]!.label, 'Cutoff');
  lib.setProperty(enc(id), 'label', '');
  assert.equal('label' in lib.getState().configuration.setups[0]!.encoderGroups[0]!.encoders[0]!, false);
});

// --- group name and setup name ---
test('setGroupName normalizes, pads and reports hints', async () => {
  const { lib } = await open();
  const id = firstId(lib);
  const r = lib.setGroupName(id, 2, 'Kic');
  assert.equal(lib.getState().configuration.setups[0]!.encoderGroups[2]!.name, 'ic  ');
  assert.match(r.message ?? '', /"K" cannot be shown/);
  lib.setGroupName(id, 2, 'a=b-');
  assert.equal(lib.getState().configuration.setups[0]!.encoderGroups[2]!.name, 'a=b-');
  assert.deepEqual(lib.getState().problems, []);
  assert.equal(lib.setGroupName(id, 8, 'abcd').message !== undefined, true);
  assert.equal(lib.setGroupName('missing', 0, 'abcd').message !== undefined, true);
});

test('renameSetup trims nothing, refuses an empty name, and is undoable', async () => {
  const { lib } = await open();
  const id = firstId(lib);
  assert.ok(lib.setSetupName(id, '').message);
  assert.equal(lib.getState().configuration.setups[0]!.name, 'SE01');
  lib.setSetupName(id, 'Drums');
  assert.equal(lib.getState().configuration.setups[0]!.name, 'Drums');
  lib.undo();
  assert.equal(lib.getState().configuration.setups[0]!.name, 'SE01');
  assert.ok(lib.setSetupName('missing', 'x').message);
});

// --- undo / redo ---
test('undo and redo walk back and forth; a new command clears redo', async () => {
  const { lib } = await open();
  const id = firstId(lib);
  const start = lib.getState().configuration;
  lib.setProperty(enc(id), 'channel', 2);
  lib.setProperty(enc(id), 'channel', 3);
  assert.equal(lib.getState().canUndo, true);
  lib.undo();
  assert.equal(lib.getState().configuration.setups[0]!.encoderGroups[0]!.encoders[0]!.channel, 2);
  assert.equal(lib.getState().canRedo, true);
  lib.redo();
  assert.equal(lib.getState().configuration.setups[0]!.encoderGroups[0]!.encoders[0]!.channel, 3);
  lib.undo();
  lib.setProperty(enc(id), 'channel', 5);
  assert.equal(lib.getState().canRedo, false);
  lib.undo();
  lib.undo();
  assert.deepEqual(lib.getState().configuration.setups, start.setups);
  assert.equal(lib.getState().canUndo, false);
});

test('undo with nothing to undo and redo with nothing to redo say so and do not throw', async () => {
  const { lib } = await open();
  assert.ok(lib.undo().message);
  assert.ok(lib.redo().message);
});

test('undo and redo are saved too', async () => {
  const { lib, storage } = await open();
  lib.setSetupName(firstId(lib), 'A');
  lib.undo();
  await lib.whenSaved();
  assert.equal(stored(storage).setups[0]!.name, 'SE01');
  lib.redo();
  await lib.whenSaved();
  assert.equal(stored(storage).setups[0]!.name, 'A');
});

test('the selection survives undo; undo does not select a setup that is gone', async () => {
  const { lib } = await open();
  lib.select({ encoderGroup: 4 });
  lib.setSetupName(firstId(lib), 'A');
  lib.undo();
  assert.equal(lib.getState().selection.encoderGroup, 4);
});

test('the history is capped, the oldest step falls away', async () => {
  const lib = (await openLibrary(memoryStorage(), { now: clock, historyLimit: 5 })).library;
  const id = firstId(lib);
  for (let i = 0; i < 12; i++) lib.setProperty(enc(id), 'number', i);
  let steps = 0;
  while (lib.getState().canUndo) { lib.undo(); steps++; }
  assert.equal(steps, 5);
  assert.equal(lib.getState().configuration.setups[0]!.encoderGroups[0]!.encoders[0]!.number, 6, 'the oldest steps fell away: undo stops after edit 6');
});

test('the default history holds 200 steps', () => {
  assert.equal(HISTORY_LIMIT, 200);
});

// --- subscribe and saving ---
test('subscribers get every new state, and stop after unsubscribe', async () => {
  const { lib } = await open();
  const seen: string[] = [];
  const off = lib.subscribe((s) => seen.push(s.configuration.setups[0]!.name));
  assert.deepEqual(seen, ['SE01'], 'called once at once with the current state');
  lib.setSetupName(firstId(lib), 'A');
  lib.select({ encoderGroup: 1 });
  off();
  lib.setSetupName(firstId(lib), 'B');
  assert.deepEqual(seen.slice(0, 3), ['SE01', 'A', 'A']);
  assert.ok(!seen.includes('B'));
});

test('saved after every command: status goes saving → saved', async () => {
  const { lib } = await open();
  await lib.whenSaved();
  assert.equal(lib.getState().saveStatus, 'saved');
  lib.setSetupName(firstId(lib), 'A');
  assert.equal(lib.getState().saveStatus, 'saving');
  await lib.whenSaved();
  assert.equal(lib.getState().saveStatus, 'saved');
});

test('saves are written in order, the last state wins', async () => {
  const { lib, storage } = await open();
  const id = firstId(lib);
  for (let i = 1; i <= 5; i++) lib.setProperty(enc(id), 'channel', i);
  await lib.whenSaved();
  assert.equal(stored(storage).setups[0]!.encoderGroups[0]!.encoders[0]!.channel, 5);
});

test('a failing storage does not throw: status "failed" and a message, the edit stays; the next save retries', async () => {
  const storage = memoryStorage();
  const lib = (await openLibrary(storage, { now: clock })).library;
  await lib.whenSaved();
  storage.failNextWrites(1);
  lib.setSetupName(firstId(lib), 'A');
  await lib.whenSaved();
  assert.equal(lib.getState().saveStatus, 'failed');
  assert.match(lib.getState().message ?? '', /not saved/);
  assert.equal(lib.getState().configuration.setups[0]!.name, 'A');
  lib.setSetupName(firstId(lib), 'B');
  await lib.whenSaved();
  assert.equal(lib.getState().saveStatus, 'saved');
  assert.equal(stored(storage).setups[0]!.name, 'B');
});

test('every saved state validates', async () => {
  const { lib, storage } = await open();
  lib.setGroupName(firstId(lib), 0, 'x y ');
  lib.setProperty(enc(firstId(lib)), 'type', 'Pbnd');
  await lib.whenSaved();
  assert.deepEqual(validate(stored(storage)), []);
});

test('the message belongs to the command that made it and is cleared by the next one', async () => {
  const { lib } = await open();
  const id = firstId(lib);
  lib.setProperty(enc(id), 'number', 100);
  lib.setProperty(enc(id), 'type', 'CCAh');
  assert.ok(lib.getState().message);
  lib.select({ encoderGroup: 1 });
  assert.equal(lib.getState().message, undefined);
});

// --- never overwrite what could not be read ---
test('storage that cannot be read: the library opens, edits work, but nothing is written over the stored text', async () => {
  const storage = memoryStorage('stored library');
  storage.failReads(true);
  const opened = await openLibrary(storage, { now: clock });
  assert.match(opened.message ?? '', /not saved/);
  assert.equal(opened.library.getState().saveStatus, 'failed');
  storage.failReads(false);
  opened.library.setSetupName(opened.library.getState().configuration.setups[0]!.id, 'A');
  await opened.library.whenSaved();
  assert.equal(storage.text(), 'stored library');
  assert.equal(opened.library.getState().saveStatus, 'failed');
  assert.match(opened.library.getState().message ?? '', /could not be read; reload/);
  assert.equal(opened.library.getState().configuration.setups[0]!.name, 'A');
});

test('unreadable text that cannot be put aside is not overwritten', async () => {
  const storage = memoryStorage('{ bad');
  storage.failQuarantine(true);
  const opened = await openLibrary(storage, { now: clock });
  assert.match(opened.message ?? '', /not saved/);
  opened.library.setSetupName(opened.library.getState().configuration.setups[0]!.id, 'A');
  await opened.library.whenSaved();
  assert.equal(storage.text(), '{ bad');
  assert.equal(opened.library.getState().saveStatus, 'failed');
});

test('an earlier failed save does not mark a later successful one as failed', async () => {
  const storage = memoryStorage();
  const lib = (await openLibrary(storage, { now: clock })).library;
  await lib.whenSaved();
  storage.failNextWrites(1);
  lib.setSetupName(firstId(lib), 'A');
  lib.setSetupName(firstId(lib), 'B');
  await lib.whenSaved();
  assert.equal(lib.getState().saveStatus, 'saved');
  assert.equal(stored(storage).setups[0]!.name, 'B');
});

test('a subscriber that throws neither breaks a command nor stops saving', async () => {
  const { lib, storage } = await open();
  let calls = 0;
  lib.subscribe(() => { if (++calls > 1) throw new Error('boom'); });
  lib.setSetupName(firstId(lib), 'A');
  lib.setSetupName(firstId(lib), 'B');
  await lib.whenSaved();
  assert.equal(stored(storage).setups[0]!.name, 'B');
});

// --- group labels (plan 0006 step 14, decision 25) ---
const kinds = [['encoder', 'encoderGroups'], ['faderButton', 'faderButtonGroups']] as const;
for (const [kind, field] of kinds) {
  test(`setGroupLabel sets, replaces and (empty) removes the label of a ${kind} group`, async () => {
    const { lib, storage } = await open();
    const id = firstId(lib);
    const group = () => lib.getState().configuration.setups[0]![field][3]! as { label?: string };
    lib.setGroupLabel(id, kind, 3, 'Filter sweep');
    assert.equal(group().label, 'Filter sweep');
    assert.equal(lib.getState().setups[0]!.differsFromFactory, true);
    await lib.whenSaved();
    assert.equal((stored(storage).setups[0]![field][3]! as { label?: string }).label, 'Filter sweep');
    lib.setGroupLabel(id, kind, 3, '');
    assert.equal('label' in group(), false);
    assert.equal(lib.getState().setups[0]!.differsFromFactory, false);
  });

  test(`setGroupLabel on a ${kind} group is one undo step and survives JSON export and import`, async () => {
    const { lib } = await open();
    const id = firstId(lib);
    lib.setGroupLabel(id, kind, 0, 'Pads');
    lib.undo();
    assert.equal('label' in lib.getState().configuration.setups[0]![field][0]!, false);
    lib.redo();
    const file = lib.exportWhole().file!;
    const other = (await open()).lib;
    other.importFile(file.text);
    assert.equal((other.getState().configuration.setups[0]![field][0]! as { label?: string }).label, 'Pads');
  });
}

test('setGroupLabel keeps the 4-character group name and refuses wrong input', async () => {
  const { lib } = await open();
  const id = firstId(lib);
  const name = lib.getState().configuration.setups[0]!.encoderGroups[1]!.name;
  lib.setGroupLabel(id, 'encoder', 1, 'Filter');
  assert.equal(lib.getState().configuration.setups[0]!.encoderGroups[1]!.name, name);
  assert.ok(lib.setGroupLabel('nope', 'encoder', 1, 'x').message);
  assert.ok(lib.setGroupLabel(id, 'encoder', 8, 'x').message);
  assert.ok(lib.setGroupLabel(id, 'faders' as never, 0, 'x').message);
  assert.ok(lib.setGroupLabel(id, 'encoder', 0, 5 as never).message);
  const fresh = (await open()).lib;
  fresh.setGroupLabel(firstId(fresh), 'encoder', 2, '  ');
  assert.equal(fresh.getState().canUndo, false, 'a blank label is no label');
  lib.setGroupLabel(id, 'faderButton', 2, ' Pads ');
  assert.equal(lib.getState().configuration.setups[0]!.faderButtonGroups[2]!.label, 'Pads');
});

test('setting the label a group already has is not a change', async () => {
  const { lib } = await open();
  const id = firstId(lib);
  lib.setGroupLabel(id, 'encoder', 0, '');
  assert.equal(lib.getState().canUndo, false);
  lib.setGroupLabel(id, 'encoder', 0, 'A');
  lib.undo();
  lib.redo();
  const before = lib.getState().configuration;
  lib.setGroupLabel(id, 'encoder', 0, 'A');
  assert.equal(lib.getState().configuration, before);
});

// --- copy / paste (plan 0006 steps 20, 22) ---
// Old address-shaped calls: copy the source now, paste at once.
import type { Clip, CommandResult as CmdResult, GroupAddress } from '../../src/storage/index.ts';
const clipOf = (lib: Library, source: Parameters<Library['copy']>[0]): Clip => { const c = lib.copy(source); return c.clip ?? ({ refused: c.message } as never); };
const refusedBy = (lib: Library, source: Parameters<Library['copy']>[0]): CmdResult | undefined => { const c = lib.copy(source); return c.clip ? undefined : c; };
function pasteSetup(lib: Library, from: string, to: string): CmdResult {
  return refusedBy(lib, { kind: 'setup', setupId: from }) ?? lib.pasteSetup(clipOf(lib, { kind: 'setup', setupId: from }), to);
}
function pasteGroup(lib: Library, kind: 'encoderGroup' | 'faderButtonGroup', from: GroupAddress, to: GroupAddress): CmdResult {
  const src = { kind, ...from } as const;
  return refusedBy(lib, src) ?? (kind === 'encoderGroup' ? lib.pasteEncoderGroup(clipOf(lib, src), to) : lib.pasteFaderButtonGroup(clipOf(lib, src), to));
}
function pasteControl(lib: Library, from: ControlAddress, to: ControlAddress): CmdResult {
  const src = { kind: 'control', ...from } as const;
  return refusedBy(lib, src) ?? lib.pasteControl(clipOf(lib, src), to);
}
const setupId = (lib: Library, n: number) => lib.getState().configuration.setups[n - 1]!.id;
const setupOf = (lib: Library, n: number) => lib.getState().configuration.setups[n - 1]!;

test('pasteSetup: every control, names and labels; the target keeps id, slot, name and notes; one undo step', async () => {
  const { lib } = await open();
  const [a, b] = [setupId(lib, 1), setupId(lib, 2)];
  lib.setProperty(enc(a, 3, 2), 'number', 77);
  lib.setProperty(enc(a, 3, 2), 'label', 'cutoff');
  lib.setGroupName(a, 1, 'ABCD');
  lib.setGroupLabel(a, 'faderButton', 4, 'drums');
  lib.setSetupName(b, 'mine');
  const before = setupOf(lib, 2);
  const r = pasteSetup(lib, a, b);
  assert.equal(r.message, '"' + setupOf(lib, 1).name + '" is pasted onto "mine".');
  const after = setupOf(lib, 2);
  assert.deepEqual({ ...after, id: '', slot: 0, name: '' }, { ...setupOf(lib, 1), id: '', slot: 0, name: '' });
  assert.equal(after.id, before.id);
  assert.equal(after.slot, before.slot);
  assert.equal(after.name, 'mine');
  assert.equal(after.encoderGroups[2]!.encoders[3]!.label, 'cutoff');
  assert.equal(after.faderButtonGroups[4]!.label, 'drums');
  lib.undo();
  assert.deepEqual(setupOf(lib, 2), before);
  lib.redo();
  assert.equal(setupOf(lib, 2).encoderGroups[2]!.encoders[3]!.number, 77);
});

test('pasteSetup copies by value: editing the target later leaves the source alone', async () => {
  const { lib } = await open();
  const [a, b] = [setupId(lib, 1), setupId(lib, 2)];
  pasteSetup(lib, a, b);
  lib.setProperty(enc(b), 'number', 99);
  assert.notEqual(setupOf(lib, 1).encoderGroups[0]!.encoders[0]!.number, 99);
});

test('pasteSetup onto itself, or onto an identical setup, is no undo step; unknown setups are refused', async () => {
  const { lib } = await open();
  const [a, b] = [setupId(lib, 1), setupId(lib, 2)];
  assert.equal(pasteSetup(lib, a, a).state.canUndo, false);
  pasteSetup(lib, a, b);
  lib.undo();
  assert.equal(lib.getState().canUndo, false);
  pasteSetup(lib, a, b);
  assert.equal(lib.getState().canUndo, true);
  lib.undo();
  lib.redo();
  assert.match(pasteSetup(lib, 'nope', a).message!, /no setup "nope"/);
  assert.match(pasteSetup(lib, a, 'nope').message!, /no setup "nope"/);
  // pasting again leaves the stack as it is
  pasteSetup(lib, a, b);
  lib.undo();
  assert.equal(lib.getState().canUndo, false);
});

test('pasteEncoderGroup: 8 encoders, 8 push buttons, name and label; across setups; undo and redo', async () => {
  const { lib } = await open();
  const [a, b] = [setupId(lib, 1), setupId(lib, 2)];
  lib.setProperty(enc(a, 0, 1), 'number', 55);
  lib.setProperty({ setupId: a, area: 'pushButtons', group: 1, index: 7 }, 'number', 44);
  lib.setGroupName(a, 1, 'FiLt'); // stored lower case
  lib.setGroupLabel(a, 'encoder', 1, 'filters');
  const other = structuredClone(setupOf(lib, 2));
  pasteGroup(lib, 'encoderGroup', { setupId: a, group: 1 }, { setupId: b, group: 6 });
  const g = setupOf(lib, 2).encoderGroups[6]!;
  assert.deepEqual(g, setupOf(lib, 1).encoderGroups[1]);
  assert.equal(g.name, 'filt');
  assert.equal(g.label, 'filters');
  assert.deepEqual(setupOf(lib, 2).faderButtonGroups, other.faderButtonGroups);
  lib.undo();
  assert.deepEqual(setupOf(lib, 2), other);
  lib.redo();
  assert.deepEqual(setupOf(lib, 2).encoderGroups[6], g);
});

test('pasteEncoderGroup within a setup; onto itself is a no-op; bad groups are refused', async () => {
  const { lib } = await open();
  const a = setupId(lib, 1);
  lib.setProperty(enc(a, 0, 0), 'number', 5);
  assert.equal(pasteGroup(lib, 'encoderGroup', { setupId: a, group: 0 }, { setupId: a, group: 0 }).state.canUndo, true); // the edit above
  lib.undo();
  assert.equal(lib.getState().canUndo, false);
  assert.equal(pasteGroup(lib, 'encoderGroup', { setupId: a, group: 3 }, { setupId: a, group: 3 }).state.canUndo, false);
  assert.match(pasteGroup(lib, 'encoderGroup', { setupId: a, group: 8 }, { setupId: a, group: 0 }).message!, /no such group/);
  assert.match(pasteGroup(lib, 'encoderGroup', { setupId: 'x', group: 0 }, { setupId: a, group: 0 }).message!, /no setup "x"/);
});

test('pasteFaderButtonGroup: 8 faders, fader 9, 8 green buttons and the label; encoder groups stay', async () => {
  const { lib } = await open();
  const [a, b] = [setupId(lib, 1), setupId(lib, 3)];
  lib.setProperty({ setupId: a, area: 'faders', group: 2, index: 8 }, 'number', 66);
  lib.setProperty({ setupId: a, area: 'buttons', group: 2, index: 0 }, 'number', 12);
  lib.setGroupLabel(a, 'faderButton', 2, 'mix');
  const encoders = structuredClone(setupOf(lib, 3).encoderGroups);
  pasteGroup(lib, 'faderButtonGroup', { setupId: a, group: 2 }, { setupId: b, group: 0 });
  const g = setupOf(lib, 3).faderButtonGroups[0]!;
  assert.deepEqual(g, setupOf(lib, 1).faderButtonGroups[2]);
  assert.equal(g.faders[8]!.number, 66);
  assert.equal(g.label, 'mix');
  assert.deepEqual(setupOf(lib, 3).encoderGroups, encoders);
  lib.undo();
  assert.notEqual(setupOf(lib, 3).faderButtonGroups[0]!.faders[8]!.number, 66);
});

test('pasteControl: all properties and the label onto the same kind; a missing label clears the target\'s', async () => {
  const { lib } = await open();
  const a = setupId(lib, 1);
  const from = enc(a, 1, 0);
  lib.setProperty(from, 'type', 'CCAb');
  lib.setProperty(from, 'number', 20);
  lib.setProperty(from, 'channel', 5);
  lib.setProperty(from, 'label', 'vol');
  const to = enc(setupId(lib, 4), 6, 5);
  lib.setProperty(to, 'label', 'old');
  pasteControl(lib, from, to);
  const c = setupOf(lib, 4).encoderGroups[5]!.encoders[6]!;
  assert.deepEqual(c, setupOf(lib, 1).encoderGroups[0]!.encoders[1]);
  lib.undo();
  assert.equal(setupOf(lib, 4).encoderGroups[5]!.encoders[6]!.label, 'old');
  lib.redo();
  lib.setProperty(enc(a, 2), 'label', '');
  pasteControl(lib, enc(a, 2), to);
  assert.equal(setupOf(lib, 4).encoderGroups[5]!.encoders[6]!.label, undefined);
});

test('pasteControl: push buttons, green buttons and faders paste onto their own kind', async () => {
  const { lib } = await open();
  const a = setupId(lib, 1);
  for (const [area, index, other] of [['pushButtons', 2, 5], ['buttons', 1, 6], ['faders', 3, 7]] as const) {
    const from: ControlAddress = { setupId: a, area, group: 0, index };
    const to: ControlAddress = { setupId: a, area, group: 3, index: other };
    lib.setProperty(from, 'number', 99);
    pasteControl(lib, from, to);
    assert.equal((setupOf(lib, 1) as unknown as Record<string, Record<string, { number: number }[]>[]>)[area === 'pushButtons' ? 'encoderGroups' : 'faderButtonGroups']![3]![area]![other]!.number, 99, area);
  }
});

test('pasteControl refuses other kinds, and fader 9 is its own kind', async () => {
  const { lib } = await open();
  const a = setupId(lib, 1);
  const at = (area: ControlAddress['area'], index: number): ControlAddress => ({ setupId: a, area, group: 0, index });
  const before = lib.getState().configuration;
  assert.match(pasteControl(lib, at('encoders', 0), at('pushButtons', 0)).message!, /encoder can only be pasted onto a encoder, not onto a push button/);
  assert.match(pasteControl(lib, at('buttons', 0), at('faders', 0)).message!, /green button can only/);
  assert.match(pasteControl(lib, at('faders', 8), at('faders', 0)).message!, /Fader 9 is its own kind/);
  assert.match(pasteControl(lib, at('faders', 0), at('faders', 8)).message!, /Fader 9 is its own kind/);
  assert.match(pasteControl(lib, at('encoders', 8), at('encoders', 0)).message!, /no such control/);
  assert.match(pasteControl(lib, at('encoders', 0), { ...at('encoders', 1), group: 9 }).message!, /no group 9/);
  assert.match(pasteControl(lib, at('encoders', 0), { ...at('encoders', 1), setupId: 'x' }).message!, /no setup "x"/);
  assert.equal(lib.getState().configuration, before);
  lib.setProperty(at('faders', 8), 'number', 40);
  const nine = pasteControl(lib, at('faders', 8), { ...at('faders', 8), group: 5 });
  assert.equal(nine.message, 'Fader 9 of "' + setupOf(lib, 1).name + '" is pasted.');
});

test('pasteControl onto itself is no undo step', async () => {
  const { lib } = await open();
  const a = setupId(lib, 1);
  assert.equal(pasteControl(lib, enc(a, 1), enc(a, 1)).state.canUndo, false);
});

// Marks: a setup with unreadable values (a dump with an odd byte) pasted from and onto.
test('pasted marks: the source\'s are copied along, the target\'s are dropped where overwritten; undo brings them back', async () => {
  const lib = (await open()).lib;
  const fs = await import('node:fs');
  const { parseFrame, writeFrame } = await import('../../src/protocol/frame.ts');
  const r = parseFrame(new Uint8Array(fs.readFileSync(new URL('../fixtures/sysex/base.syx', import.meta.url))));
  assert.ok(r.ok);
  const address = 0x1c00 + 0x500 * 15;
  const rec = r.frame.records.find((x) => address >= x.address && address < x.address + x.data.length)!;
  rec.data[address - rec.address] = 0x7f;
  rec.sumInDump = rec.sumComputed = rec.data.reduce((acc, v) => (acc + v) & 0xffff, 0);
  lib.importFile(writeFrame(r.frame), { replace: true });
  const marked = lib.getState().configuration.setups.find((s) => s.slot === 16)!;
  const markPaths = lib.getState().problems.map((p) => p.path.replace(/^setups\[\d+\]\./, ''));
  assert.ok(markPaths.length > 0);
  const sourceGroup = Number(/^(?:encoderGroups|faderButtonGroups)\[(\d)\]/.exec(markPaths[0]!)![1]);
  const kind = markPaths[0]!.startsWith('encoderGroups') ? 'encoder' : 'faderButton';
  const clean = setupId(lib, 1);
  const count = () => lib.getState().problems.length;
  // whole setup to a clean one: the marks follow
  pasteSetup(lib, marked.id, clean);
  assert.equal(count(), markPaths.length * 2);
  assert.deepEqual(lib.getState().problems.slice(0, markPaths.length).map((p) => p.path), markPaths.map((p) => 'setups[0].' + p));
  // a clean setup pasted back onto the marked one drops its marks
  pasteSetup(lib, setupId(lib, 2), marked.id);
  assert.equal(count(), markPaths.length);
  lib.undo();
  assert.equal(count(), markPaths.length * 2);
  lib.undo();
  assert.equal(count(), markPaths.length);
  // group paste, to another group of a clean setup, then over it with a clean group
  const paste = (f: GroupAddress, t: GroupAddress) => pasteGroup(lib, kind === 'encoder' ? 'encoderGroup' : 'faderButtonGroup', f, t);
  paste({ setupId: marked.id, group: sourceGroup }, { setupId: clean, group: 7 });
  assert.equal(count(), markPaths.length + markPaths.filter((p) => p.includes(`[${sourceGroup}]`)).length);
  assert.ok(lib.getState().problems.some((p) => p.path.startsWith(`setups[0].${kind === 'encoder' ? 'encoderGroups' : 'faderButtonGroups'}[7].`)));
  paste({ setupId: setupId(lib, 2), group: 7 }, { setupId: clean, group: 7 });
  assert.equal(count(), markPaths.length);
});

test('a pasted unreadable value is not covered by the setup\'s own dump: export and send refuse until it is set', async () => {
  const lib = (await open()).lib;
  const fs = await import('node:fs');
  const { parseFrame, writeFrame } = await import('../../src/protocol/frame.ts');
  const r = parseFrame(new Uint8Array(fs.readFileSync(new URL('../fixtures/sysex/base.syx', import.meta.url))));
  assert.ok(r.ok);
  const address = 0x1c00 + 0x500 * 15;
  const rec = r.frame.records.find((x) => address >= x.address && address < x.address + x.data.length)!;
  rec.data[address - rec.address] = 0x7f;
  rec.sumInDump = rec.sumComputed = rec.data.reduce((acc, v) => (acc + v) & 0xffff, 0);
  lib.importFile(writeFrame(r.frame), { replace: true });
  const id = lib.getState().configuration.setups.find((s) => s.slot === 16)!.id;
  const own = lib.getState().problems[0]!.path.replace(/^setups\[\d+\]\./, '');
  assert.match(own, /^encoderGroups\[0\]/);
  assert.ok(lib.exportSetupSyx(id).file, 'its own mark is kept by its own dump');
  pasteGroup(lib, 'encoderGroup', { setupId: id, group: 0 }, { setupId: id, group: 1 });
  const pastedPath = own.replace('encoderGroups[0]', 'encoderGroups[1]');
  assert.ok(lib.getState().problems.some((p) => p.path.endsWith(pastedPath)));
  assert.ok(lib.getState().problems.every((p) => !p.path.includes('#')));
  const refused = lib.exportSetupSyx(id);
  assert.equal(refused.file, undefined);
  assert.deepEqual(refused.refusal!.fields, [pastedPath]);
  const plan = lib.planSend(16, { connectedAt: 0 });
  assert.ok(!plan.ok);
  assert.deepEqual(plan.refusal.fields, [pastedPath]);
  // setting the value clears the mark; export and send work again
  const m = /^encoderGroups\[1\]\.encoders\[(\d)\]\.(\w+)$/.exec(pastedPath)!;
  const value = lib.getState().configuration.setups.find((s) => s.id === id)!.encoderGroups[1]!.encoders[Number(m[1])]![m[2] as 'type'];
  lib.setProperty({ setupId: id, area: 'encoders', group: 1, index: Number(m[1]) }, m[2] as 'type', value);
  assert.ok(lib.exportSetupSyx(id).file);
  assert.ok(lib.planSend(16, { connectedAt: 0 }).ok);
});

// --- Copy takes a snapshot (plan 0006 decision 35, step 22) ---
test('copy: an edit to the source after Copy does not come along; setup, group and control', async () => {
  const { lib } = await open();
  const [a, b] = [setupId(lib, 1), setupId(lib, 2)];
  const orig = setupOf(lib, 1).encoderGroups[0]!.encoders[0]!.number;
  const setupClip = lib.copy({ kind: 'setup', setupId: a }).clip!;
  const groupClip = lib.copy({ kind: 'encoderGroup', setupId: a, group: 0 }).clip!;
  const controlClip = lib.copy({ kind: 'control', ...enc(a, 0, 0) }).clip!;
  lib.setProperty(enc(a, 0, 0), 'number', (orig + 5) % 100);
  lib.setProperty(enc(a, 0, 0), 'label', 'edited');
  lib.pasteSetup(setupClip, b);
  assert.equal(setupOf(lib, 2).encoderGroups[0]!.encoders[0]!.number, orig);
  assert.notEqual(setupOf(lib, 2).encoderGroups[0]!.encoders[0]!.label, 'edited');
  lib.pasteEncoderGroup(groupClip, { setupId: b, group: 5 });
  assert.equal(setupOf(lib, 2).encoderGroups[5]!.encoders[0]!.number, orig);
  lib.pasteControl(controlClip, enc(b, 3, 6));
  assert.equal(setupOf(lib, 2).encoderGroups[6]!.encoders[3]!.number, orig);
  assert.notEqual(setupOf(lib, 2).encoderGroups[6]!.encoders[3]!.label, 'edited');
});

test('copy: the clip is immutable and copy changes nothing (no undo step)', async () => {
  const { lib } = await open();
  const a = setupId(lib, 1);
  const r = lib.copy({ kind: 'setup', setupId: a });
  assert.equal(r.state.canUndo, false);
  const clip = r.clip as Clip & { kind: 'setup' };
  assert.ok(Object.isFrozen(clip));
  assert.ok(Object.isFrozen(clip.encoderGroups[0]!.encoders[0]));
  assert.throws(() => { (clip.encoderGroups[0]!.encoders[0] as { number: number }).number = 1; });
});

test('paste a clip: one undo step, undo and redo; the same clip pastes again', async () => {
  const { lib } = await open();
  const [a, b, c] = [setupId(lib, 1), setupId(lib, 2), setupId(lib, 3)];
  lib.setProperty(enc(a, 1, 1), 'number', 42);
  const clip = lib.copy({ kind: 'encoderGroup', setupId: a, group: 1 }).clip!;
  const before = setupOf(lib, 2);
  lib.pasteEncoderGroup(clip, { setupId: b, group: 0 });
  assert.equal(setupOf(lib, 2).encoderGroups[0]!.encoders[1]!.number, 42);
  lib.undo();
  assert.deepEqual(setupOf(lib, 2), before);
  lib.redo();
  assert.equal(setupOf(lib, 2).encoderGroups[0]!.encoders[1]!.number, 42);
  lib.pasteEncoderGroup(clip, { setupId: c, group: 0 });
  assert.equal(setupOf(lib, 3).encoderGroups[0]!.encoders[1]!.number, 42);
});

test('paste a clip back onto its source: no step while unchanged, restores the snapshot after an edit', async () => {
  const { lib } = await open();
  const a = setupId(lib, 1);
  const clip = lib.copy({ kind: 'control', ...enc(a, 4, 2) }).clip!;
  assert.equal(lib.pasteControl(clip, enc(a, 4, 2)).state.canUndo, false);
  const orig = setupOf(lib, 1).encoderGroups[2]!.encoders[4]!.number;
  lib.setProperty(enc(a, 4, 2), 'number', (orig + 1) % 100);
  lib.pasteControl(clip, enc(a, 4, 2));
  assert.equal(setupOf(lib, 1).encoderGroups[2]!.encoders[4]!.number, orig);
});

test('paste a clip: marks are taken at Copy and carried from the clip', async () => {
  const lib = (await open()).lib;
  const fs = await import('node:fs');
  const { parseFrame, writeFrame } = await import('../../src/protocol/frame.ts');
  const r = parseFrame(new Uint8Array(fs.readFileSync(new URL('../fixtures/sysex/base.syx', import.meta.url))));
  assert.ok(r.ok);
  const address = 0x1c00 + 0x500 * 15;
  const rec = r.frame.records.find((x) => address >= x.address && address < x.address + x.data.length)!;
  rec.data[address - rec.address] = 0x7f;
  rec.sumInDump = rec.sumComputed = rec.data.reduce((acc, v) => (acc + v) & 0xffff, 0);
  lib.importFile(writeFrame(r.frame), { replace: true });
  const marked = lib.getState().configuration.setups.find((s) => s.slot === 16)!;
  const n = lib.getState().problems.length;
  assert.ok(n > 0);
  const clean = setupId(lib, 1);
  const clip = lib.copy({ kind: 'setup', setupId: marked.id }).clip!;
  assert.ok(clip.marks.length > 0 && clip.marks.every((m) => m.endsWith('#pasted')));
  // the source's marks go (a clean setup pasted over it); the clip still carries them
  lib.pasteSetup(lib.copy({ kind: 'setup', setupId: setupId(lib, 2) }).clip!, marked.id);
  assert.equal(lib.getState().problems.length, 0);
  lib.pasteSetup(clip, clean);
  assert.equal(lib.getState().problems.length, n);
  lib.undo();
  assert.equal(lib.getState().problems.length, 0);
});

test('paste a clip: refusals; copy refuses bad sources', async () => {
  const { lib } = await open();
  const [a, b] = [setupId(lib, 1), setupId(lib, 2)];
  const setupClip = lib.copy({ kind: 'setup', setupId: a }).clip!;
  const groupClip = lib.copy({ kind: 'encoderGroup', setupId: a, group: 0 }).clip!;
  const fbClip = lib.copy({ kind: 'faderButtonGroup', setupId: a, group: 0 }).clip!;
  const encClip = lib.copy({ kind: 'control', ...enc(a, 0, 0) }).clip!;
  const faderClip = lib.copy({ kind: 'control', setupId: a, area: 'faders', group: 0, index: 2 }).clip!;
  const nine = lib.copy({ kind: 'control', setupId: a, area: 'faders', group: 0, index: 8 }).clip!;
  const at = (area: 'encoders' | 'pushButtons' | 'faders', index: number): ControlAddress => ({ setupId: b, area, group: 0, index });
  assert.match(lib.pasteSetup(groupClip, b).message!, /only be pasted onto an encoder group, not onto a setup/);
  assert.match(lib.pasteEncoderGroup(setupClip, { setupId: b, group: 0 }).message!, /setup; it can only be pasted onto a setup/);
  assert.match(lib.pasteEncoderGroup(fbClip, { setupId: b, group: 0 }).message!, /fader\/button group/);
  assert.match(lib.pasteFaderButtonGroup(groupClip, { setupId: b, group: 0 }).message!, /encoder group/);
  assert.match(lib.pasteControl(groupClip, at('encoders', 0)).message!, /can only be pasted onto an encoder group/);
  assert.match(lib.pasteControl(encClip, at('pushButtons', 0)).message!, /encoder can only be pasted onto a encoder, not onto a push button/);
  assert.match(lib.pasteControl(faderClip, at('faders', 8)).message!, /Fader 9 is its own kind/);
  assert.match(lib.pasteControl(nine, at('faders', 0)).message!, /Fader 9 is its own kind/);
  assert.match(lib.pasteSetup(setupClip, 'nope').message!, /no setup "nope"/);
  assert.match(lib.pasteEncoderGroup(groupClip, { setupId: b, group: 8 }).message!, /no such group/);
  assert.match(lib.copy({ kind: 'setup', setupId: 'x' }).message!, /no setup "x"/);
  assert.match(lib.copy({ kind: 'encoderGroup', setupId: a, group: 9 }).message!, /no such group/);
  assert.match(lib.copy({ kind: 'control', ...enc(a, 9) }).message!, /no such control/);
  assert.equal(lib.getState().canUndo, false);
});

// --- selection steps (plan 0008 decision 19) ---
test('select asStep is one undo step holding the previous selection; undo and redo restore it', async () => {
  const { lib } = await open();
  const before = lib.getState().selection;
  const config = lib.getState().configuration;
  lib.select({ setupId: 'factory-se05', encoderGroup: 3, faderButtonGroup: 2 }, { asStep: true });
  const after = lib.getState().selection;
  assert.equal(after.setupId, 'factory-se05');
  assert.equal(lib.getState().canUndo, true);
  lib.undo();
  assert.deepEqual(lib.getState().selection, before);
  assert.equal(lib.getState().configuration, config);
  assert.equal(lib.getState().canRedo, true);
  lib.redo();
  assert.deepEqual(lib.getState().selection, after);
});

test('select asStep with no change, or a refusal, is no step; plain select stays out of the history', async () => {
  const { lib } = await open();
  lib.select({ encoderGroup: 0 }, { asStep: true });
  assert.equal(lib.getState().canUndo, false);
  assert.ok(lib.select({ setupId: 'nope' }, { asStep: true }).message);
  assert.equal(lib.getState().canUndo, false);
  lib.select({ encoderGroup: 4 });
  assert.equal(lib.getState().canUndo, false);
});

test('a selection step clears redo, and sits in order with edits', async () => {
  const { lib } = await open();
  const id = firstId(lib);
  lib.setProperty(enc(id), 'channel', 2);
  lib.select({ encoderGroup: 5 }, { asStep: true });
  lib.setProperty(enc(id, 0, 5), 'channel', 4);
  lib.undo();
  assert.equal(lib.getState().selection.encoderGroup, 5, 'the edit step does not hold a selection');
  lib.undo();
  assert.equal(lib.getState().selection.encoderGroup, 0);
  assert.equal(lib.getState().configuration.setups[0]!.encoderGroups[0]!.encoders[0]!.channel, 2);
  lib.select({ faderButtonGroup: 1 }, { asStep: true });
  assert.equal(lib.getState().canRedo, false);
});

test('setProperty with a selection: one undo step reverts the edit and the selection, redo brings both', async () => {
  const { lib } = await open();
  const target = 'factory-se05';
  const before = lib.getState().selection;
  lib.setProperty(enc(target, 2, 6), 'channel', 9, { selection: { setupId: target, encoderGroup: 6 } });
  const s = lib.getState();
  assert.deepEqual([s.selection.setupId, s.selection.encoderGroup], [target, 6]);
  assert.equal(s.configuration.setups.find((x) => x.id === target)!.encoderGroups[6]!.encoders[2]!.channel, 9);
  lib.undo();
  assert.deepEqual(lib.getState().selection, before);
  assert.notEqual(lib.getState().configuration.setups.find((x) => x.id === target)!.encoderGroups[6]!.encoders[2]!.channel, 9);
  lib.redo();
  assert.equal(lib.getState().selection.encoderGroup, 6);
  assert.equal(lib.getState().configuration.setups.find((x) => x.id === target)!.encoderGroups[6]!.encoders[2]!.channel, 9);
});

test('setProperty with a refused selection changes nothing; an edit that changes nothing still takes the selection as a step', async () => {
  const { lib } = await open();
  const id = firstId(lib);
  const r = lib.setProperty(enc(id), 'channel', 9, { selection: { setupId: 'nope' } });
  assert.ok(r.message);
  assert.equal(lib.getState().canUndo, false);
  const same = lib.getState().configuration.setups[0]!.encoderGroups[0]!.encoders[0]!.channel;
  lib.setProperty(enc(id), 'channel', same, { selection: { encoderGroup: 2 } });
  assert.equal(lib.getState().selection.encoderGroup, 2);
  lib.undo();
  assert.equal(lib.getState().selection.encoderGroup, 0);
});

// --- setControl ---
test('setControl replaces a whole control in one undo step, with the selection if given', async () => {
  const { lib } = await open();
  const id = firstId(lib);
  const old = lib.getState().configuration.setups[0]!.encoderGroups[2]!.encoders[1]!;
  const control = { ...(changeType(old, 'CCr1') as { control: object }).control, channel: 7, number: 12 };
  const before = lib.getState().selection;
  const r = lib.setControl(enc(id, 1, 2), control as never, { selection: { encoderGroup: 2, control: { area: 'encoders', index: 1 } } });
  assert.equal(r.message, undefined);
  const now = lib.getState().configuration.setups[0]!.encoderGroups[2]!.encoders[1]!;
  assert.deepEqual([now.type, now.channel, now.number], ['CCr1', 7, 12]);
  assert.equal(lib.getState().selection.encoderGroup, 2);
  lib.undo();
  assert.deepEqual(lib.getState().configuration.setups[0]!.encoderGroups[2]!.encoders[1], old);
  assert.deepEqual(lib.getState().selection, before);
  assert.equal(lib.getState().canUndo, false);
  lib.redo();
  assert.equal(lib.getState().configuration.setups[0]!.encoderGroups[2]!.encoders[1]!.channel, 7);
  assert.equal(lib.getState().selection.encoderGroup, 2);
});

test('setControl refuses a control the device cannot hold, an unknown target or selection, and changes nothing', async () => {
  const { lib } = await open();
  const id = firstId(lib);
  const old = lib.getState().configuration.setups[0]!.encoderGroups[0]!.encoders[0]!;
  const config = lib.getState().configuration;
  assert.ok(lib.setControl(enc(id), { ...old, type: 'CCr1x' } as never).message);
  assert.ok(lib.setControl(enc(id), { ...old, channel: 99 } as never).message);
  assert.ok(lib.setControl(enc('nope'), old).message);
  assert.ok(lib.setControl(enc(id, 99), old).message);
  assert.ok(lib.setControl(enc(id), old, { selection: { setupId: 'nope' } }).message);
  assert.equal(lib.getState().configuration, config);
  assert.equal(lib.getState().canUndo, false);
});

test('setControl with the same control is no step, unless a selection comes with it', async () => {
  const { lib } = await open();
  const id = firstId(lib);
  const old = lib.getState().configuration.setups[0]!.encoderGroups[0]!.encoders[0]!;
  lib.setControl(enc(id), { ...old });
  assert.equal(lib.getState().canUndo, false);
  lib.setControl(enc(id), { ...old }, { selection: { encoderGroup: 3 } });
  assert.equal(lib.getState().selection.encoderGroup, 3);
  lib.undo();
  assert.equal(lib.getState().selection.encoderGroup, 0);
});

test('setControl: a control with an unknown key is refused (validate flags unknown fields)', async () => {
  const { lib } = await open();
  const id = firstId(lib);
  const old = lib.getState().configuration.setups[0]!.encoderGroups[0]!.encoders[0]!;
  const r = lib.setControl(enc(id), { ...old, channel: 5, bogus: 1 } as never);
  const now = lib.getState().configuration.setups[0]!.encoderGroups[0]!.encoders[0]! as unknown as Record<string, unknown>;
  assert.ok(r.message);
  assert.equal('bogus' in now, false);
  assert.equal(lib.getState().canUndo, false);
});

test('setControl refuses only problems the edit introduces, not an existing unrelated one', async () => {
  const c = structuredClone(await open().then((o) => o.lib.getState().configuration));
  c.setups[0]!.encoderGroups[0]!.encoders[0]!.lower = 200; // an existing problem
  const { library: lib } = await openLibrary(memoryStorage(save(c)), { now: clock });
  const id = firstId(lib);
  const old = lib.getState().configuration.setups[0]!.encoderGroups[0]!.encoders[0]!;
  const r = lib.setControl(enc(id), { ...old, label: 'x' });
  assert.equal(r.message, undefined);
  assert.equal(lib.getState().configuration.setups[0]!.encoderGroups[0]!.encoders[0]!.label, 'x');
  // an edit that adds a new problem is still refused
  assert.ok(lib.setControl(enc(id), { ...old, label: 'x', channel: 99 } as never).message);
});
