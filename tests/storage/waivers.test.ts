// Waivers in the library (plan 0008 step 6, decisions 7 and 25): kept in the browser, never in files.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { openLibrary, memoryStorage } from '../../src/storage/index.ts';
import type { ControlAddress, Library } from '../../src/storage/index.ts';

const clock = () => new Date('2026-11-26T10:00:00.000Z');
const open = async (storage = memoryStorage()): Promise<{ lib: Library; storage: ReturnType<typeof memoryStorage> }> => ({
  lib: (await openLibrary(storage, { now: clock })).library, storage,
});
const enc = (setup: string, index: number, group: number): ControlAddress => ({ setupId: setup, area: 'encoders', group, index });
const fad = (setup: string, index: number, group: number): ControlAddress => ({ setupId: setup, area: 'faders', group, index });
const SE01 = 'factory-se01';
const open_ = (lib: Library) => lib.getState().warnings.filter((w) => w.state === 'open');

/** A setup with one new double that is not factory: EG1 Enc1 sends the number FG1 FAd1 sends (CC 0 → 32 on ch 1). */
function collide(lib: Library): void {
  const fader = lib.getState().configuration.setups[0]!.faderButtonGroups[0]!.faders[0]!;
  lib.setProperty(enc(SE01, 0, 0), 'type', 'CCAb');
  lib.setProperty(enc(SE01, 0, 0), 'channel', fader.channel);
  lib.setProperty(enc(SE01, 0, 0), 'number', fader.number);
}

test('a fresh library has 0 open warnings; the factory collisions are listed as "factory"', async () => {
  const { lib } = await open();
  const all = lib.getState().warnings;
  assert.equal(open_(lib).length, 0);
  assert.equal(all.filter((w) => w.state === 'factory').length, 8 * 16 + 2 * 2);
  assert.ok(all.every((w) => w.state === 'factory'));
  assert.equal(all[0]!.setupId, SE01);
  assert.equal(all[0]!.message, 'Enc1 · EG4 and FAd1 · FG1 both send CC 32 ch 1');
});

test('changing EG4 Enc1 to another CC drops that factory warning', async () => {
  const { lib } = await open();
  lib.setProperty(enc(SE01, 0, 3), 'number', 100);
  const w = lib.getState().warnings.filter((x) => x.setupId === SE01);
  assert.equal(w.length, 7);
  assert.equal(w.filter((x) => x.state === 'open').length, 0);
  assert.ok(!w.some((x) => x.message.startsWith('Enc1 · EG4')));
});

test('changing EG4 Enc1 to collide elsewhere gives an open warning; the other factory ones stay factory', async () => {
  const { lib } = await open();
  lib.setProperty(enc(SE01, 0, 3), 'number', 33); // FAd2 sends CC 33
  const w = lib.getState().warnings.filter((x) => x.setupId === SE01);
  // Enc1 now sends CC 33 like FAd2 (other half) and like Enc2 (same group).
  assert.deepEqual(w.filter((x) => x.state === 'open').map((x) => x.message), [
    'Enc1 · EG4 and Enc2 · EG4 both send CC 33 ch 1',
    'Enc1 · EG4 and FAd2 · FG1 both send CC 33 ch 1',
  ]);
  assert.equal(w.filter((x) => x.state === 'factory').length, 7); // Enc2…Enc8 against FAd2…FAd8
});

test('a factory warning lapses to open when what a control sends changes but it still collides', async () => {
  const { lib } = await open();
  // FAd1 still sends CC 32 but its lower value differs from the factory control: the collision stays, now open.
  lib.setProperty(fad(SE01, 0, 0), 'type', 'CCAb');
  lib.setProperty(fad(SE01, 0, 0), 'number', 32);
  lib.setProperty(fad(SE01, 0, 0), 'lower', 5);
  const w = lib.getState().warnings.find((x) => x.message.startsWith('Enc1 · EG4 and FAd1'))!;
  assert.equal(w.state, 'open');
});

test('labelling a factory control keeps its factory collision "factory"', async () => {
  const { lib } = await open();
  lib.setProperty(fad(SE01, 0, 0), 'label', 'kick');
  const w = lib.getState().warnings.find((x) => x.message.startsWith('Enc1 · EG4 and FAd1'))!;
  assert.equal(w.state, 'factory');
});

test('waive: the warning is waived, one undo step; unwaive reopens it, one undo step', async () => {
  const { lib } = await open();
  collide(lib);
  const [w] = open_(lib);
  assert.ok(w);
  const r = lib.waive([w]);
  assert.equal(open_(lib).length, 0);
  assert.equal(r.state.warnings.find((x) => x.message === w.message)!.state, 'waived');
  lib.undo();
  assert.equal(open_(lib).length, 1);
  lib.redo();
  assert.equal(open_(lib).length, 0);
  lib.unwaive(lib.getState().warnings.find((x) => x.state === 'waived')!);
  assert.equal(open_(lib).length, 1);
  lib.undo();
  assert.equal(open_(lib).length, 0);
});

test('waive of several warnings is one undo step', async () => {
  const { lib } = await open();
  lib.setProperty(enc(SE01, 0, 3), 'number', 33);
  lib.setProperty(enc(SE01, 1, 3), 'number', 34);
  const before = open_(lib);
  assert.ok(before.length >= 2);
  lib.waive(before);
  assert.equal(open_(lib).length, 0);
  lib.undo();
  assert.equal(open_(lib).length, before.length);
});

test('waiving a factory warning is no step; waiving a waived one again is no step', async () => {
  const { lib } = await open();
  lib.waive([lib.getState().warnings[0]!]);
  assert.equal(lib.getState().canUndo, false);
  collide(lib);
  const w = open_(lib);
  lib.waive(w);
  lib.undo(); // undoes the waive only
  assert.equal(open_(lib).length, 1);
  lib.redo();
  lib.waive(w); // already waived
  lib.undo();
  assert.equal(open_(lib).length, 1); // that undo was the first waive, not a second one
});

test('unwaive of a factory warning is refused with a message', async () => {
  const { lib } = await open();
  const r = lib.unwaive(lib.getState().warnings[0]!);
  assert.ok(r.message);
  assert.equal(lib.getState().warnings[0]!.state, 'factory');
  assert.equal(lib.getState().canUndo, false);
});

test('a waiver survives a reload', async () => {
  const { lib, storage } = await open();
  collide(lib);
  lib.waive(open_(lib));
  await lib.whenSaved();
  const again = (await openLibrary(storage, { now: clock })).library;
  assert.equal(open_(again).length, 0);
  assert.equal(again.getState().warnings.filter((w) => w.state === 'waived').length, 1);
});

test('a waiver lapses when the number, the channel or the type changes', async () => {
  for (const change of [
    (lib: Library) => lib.setProperty(enc(SE01, 0, 0), 'number', 90),
    (lib: Library) => lib.setProperty(enc(SE01, 0, 0), 'channel', 9),
    (lib: Library) => lib.setProperty(enc(SE01, 0, 0), 'type', 'Pbnd'),
  ]) {
    const { lib } = await open();
    collide(lib);
    lib.waive(open_(lib));
    change(lib);
    assert.equal(lib.getState().warnings.filter((w) => w.state === 'waived').length, 0);
  }
});

test('a lapsed waiver is gone: the same collision made again is open', async () => {
  const { lib } = await open();
  collide(lib);
  lib.waive(open_(lib));
  lib.setProperty(enc(SE01, 0, 0), 'number', 90);
  collide(lib);
  assert.equal(open_(lib).length, 1);
});

test('undo of the edit that lapsed a waiver brings the waiver back', async () => {
  const { lib } = await open();
  collide(lib);
  lib.waive(open_(lib));
  lib.setProperty(enc(SE01, 0, 0), 'number', 90);
  lib.undo();
  assert.equal(lib.getState().warnings.filter((w) => w.state === 'waived').length, 1);
});

test('waivers are in no export: not in the .json, not in a .syx text', async () => {
  const { lib, storage } = await open();
  collide(lib);
  const text = (): string => lib.exportWhole().file!.text;
  const before = text();
  lib.waive(open_(lib));
  assert.equal(text(), before);
  assert.ok(!/waiv/i.test(text()));
  await lib.whenSaved();
  assert.ok(!/waiv/i.test(storage.text()!));
  assert.ok(storage.waiversText()!.length > 2);
});

test('stored waivers for setups that are gone, or damaged text, are ignored', async () => {
  const storage = memoryStorage();
  await storage.writeWaivers('{ not json');
  assert.equal(open_((await open(storage)).lib).length, 0);
  await storage.writeWaivers(JSON.stringify([{ setupId: 'nope', controls: ['a', 'b'], key: { kind: 'cc', channel: 1, number: 1 } }, 7, null]));
  const { lib } = await open(storage);
  assert.equal(lib.getState().warnings.filter((w) => w.state === 'waived').length, 0);
});

test('a failing waiver read leaves the library working', async () => {
  const storage = memoryStorage();
  storage.readWaivers = async () => { throw new Error('boom'); };
  const { lib } = await open(storage);
  assert.equal(open_(lib).length, 0);
});

test('a waiver keeps matching when its setup moves to another index', async () => {
  const { warningId } = await import('../../src/storage/index.ts');
  const w = { setupId: 'a', controls: ['setups[0].encoderGroups[0].encoders[1]', 'setups[0].faderButtonGroups[0].faders[0]'] as [string, string], key: { kind: 'cc' as const, channel: 1, number: 5 } };
  const moved = { ...w, controls: ['setups[7].encoderGroups[0].encoders[1]', 'setups[7].faderButtonGroups[0].faders[0]'] as [string, string] };
  assert.equal(warningId(w), warningId(moved));
});
