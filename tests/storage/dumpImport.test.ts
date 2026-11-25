// Importing a .syx dump through the library (plan 0005 step 1): same results as JSON, with the real fixtures.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openLibrary, memoryStorage } from '../../src/storage/index.ts';
import type { Library } from '../../src/storage/index.ts';
import { factorySetup } from '../../src/model/index.ts';
import { parseFrame, writeFrame } from '../../src/protocol/frame.ts';

const clock = () => new Date('2026-11-15T10:00:00.000Z');
const open = async (): Promise<Library> => (await openLibrary(memoryStorage(), { now: clock })).library;
const fixture = (n: string): Uint8Array => new Uint8Array(readFileSync(new URL(`../fixtures/sysex/${n}.syx`, import.meta.url)));
const sndA = () => fixture('factory-SndA');
const sndc16 = () => fixture('base'); // a Sndc of SE16 after rESc
const setup16 = (lib: Library) => lib.getState().configuration.setups.find((s) => s.slot === 16)!;

/** A copy of a dump with one memory byte changed and the record's sum fixed: a well-formed dump with an odd value. */
function withByte(bytes: Uint8Array, address: number, value: number): Uint8Array {
  const r = parseFrame(bytes);
  assert.ok(r.ok);
  const frame = r.frame;
  const rec = frame.records.find((x) => address >= x.address && address < x.address + x.data.length)!;
  rec.data[address - rec.address] = value;
  rec.sumInDump = rec.sumComputed = rec.data.reduce((a, v) => (a + v) & 0xffff, 0);
  return writeFrame(frame);
}

test('a SndA is a whole import: inspection says so, import replaces the library in one undo step', async () => {
  const lib = await open();
  lib.setSetupName('factory-se03', 'mine');
  const before = lib.getState().configuration;
  assert.deepEqual(lib.inspectImport(sndA()), { status: 'whole', setups: 18, problems: [], unexportedChanges: true });
  const r = lib.importFile(sndA());
  assert.equal(r.status, 'imported');
  assert.equal(r.status === 'imported' && r.kind, 'whole');
  const names = lib.getState().configuration.setups.map((s) => s.name);
  assert.equal(names[2], 'mine', 'a named setup keeps its name');
  assert.equal(names[0], 'SE01');
  assert.deepEqual(lib.getState().configuration.setups[5], factorySetup(6));
  lib.undo();
  assert.equal(lib.getState().configuration, before);
});

test('a Sndc is a one-setup import into its slot, asking "replace, or another slot?"', async () => {
  const lib = await open();
  const i = lib.inspectImport(sndc16());
  assert.equal(i.status, 'setup');
  if (i.status !== 'setup') return;
  assert.deepEqual([i.name, i.slot, i.problems, i.occupiedBy], ['SE16', 16, [], { id: 'factory-se16', name: 'SE16' }]);
  assert.equal(lib.importFile(sndc16()).status, 'slot-occupied');
  const r = lib.importFile(sndc16(), { replace: true });
  assert.equal(r.status, 'imported');
  assert.equal(r.status === 'imported' && r.slot, 16);
  assert.deepEqual(setup16(lib), factorySetup(16));
  lib.undo();
  assert.equal(lib.getState().canUndo, false);
});

test('a setup from a dump is named by its slot unless it replaces a named setup', async () => {
  const lib = await open();
  lib.setSetupName('factory-se16', 'kick');
  const i = lib.inspectImport(sndc16());
  assert.equal(i.status === 'setup' && i.name, 'kick');
  lib.importFile(sndc16(), { replace: true });
  assert.equal(setup16(lib).name, 'kick');
  const other = await open();
  other.setSetupName('factory-se16', 'SE16');
  other.importFile(sndc16(), { replace: true });
  assert.equal(setup16(other).name, 'SE16');
});

test('a damaged dump is refused with the engine\'s reason and what to do, and changes nothing', async () => {
  const lib = await open();
  const bad = sndc16().slice();
  bad[bad.length - 30] = (bad[bad.length - 30]! + 1) & 0x7f;
  for (const bytes of [bad, sndc16().slice(0, 100), sndA().slice(0, 5000)]) {
    const i = lib.inspectImport(bytes);
    assert.equal(i.status, 'refused');
    if (i.status === 'refused') assert.ok(i.reason && i.whatToDo);
    const r = lib.importFile(bytes);
    assert.equal(r.status, 'refused');
  }
  assert.equal(lib.getState().canUndo, false);
});

test('a checksum error from a changed byte is refused', async () => {
  const lib = await open();
  const r = parseFrame(sndc16());
  assert.ok(r.ok);
  const raw = writeFrame({ ...r.frame, records: r.frame.records.map((x, k) => (k === 3 ? { ...x, sumInDump: (x.sumInDump + 1) & 0xffff } : x)) });
  const i = lib.inspectImport(raw);
  assert.equal(i.status, 'refused');
  if (i.status === 'refused') assert.match(`${i.reason} ${i.whatToDo}`, /sum|checksum/i);
});

test('a file that is neither JSON nor a dump says what Import reads', async () => {
  const lib = await open();
  const text = new TextEncoder().encode('hello, this is a text file');
  for (const bytes of [text, new Uint8Array([1, 2, 3]), new Uint8Array(0)]) {
    const i = lib.inspectImport(bytes);
    assert.equal(i.status, 'refused');
    if (i.status === 'refused') assert.match(i.whatToDo, /\.json files or a \.syx dump from the UC4/);
    assert.equal(lib.importFile(bytes).status, 'refused');
  }
});

test('JSON given as bytes imports as it does as text', async () => {
  const lib = await open();
  const file = lib.exportSetup('factory-se05').file!;
  const i = lib.inspectImport(new TextEncoder().encode(file.text));
  assert.equal(i.status, 'setup');
  assert.equal(i.status === 'setup' && i.slot, 5);
});

test('a value the engine cannot read is a problem; the factory value stays', async () => {
  const lib = await open();
  const odd = withByte(sndc16(), 0x1c00 + 0x500 * 15, 0x7f); // encoder 1 type code outside the table
  const i = lib.inspectImport(odd);
  assert.equal(i.status, 'setup');
  if (i.status !== 'setup') return;
  assert.deepEqual(i.problems, [{
    path: 'setups[0].encoderGroups[0].encoders[0].type',
    message: 'unreadable in the dump, factory value shown',
  }]);
  const r = lib.importFile(odd, { replace: true });
  assert.equal(r.status === 'imported' && r.problemCount, 1);
  assert.equal(setup16(lib).encoderGroups[0]!.encoders[0]!.type, factorySetup(16).encoderGroups[0]!.encoders[0]!.type);
});

test('a problem of a whole dump points at its setup in the library', async () => {
  const lib = await open();
  const odd = withByte(sndA(), 0x1c00 + 0x500 * 15, 0x7f);
  const i = lib.inspectImport(odd);
  assert.equal(i.status, 'whole');
  if (i.status === 'whole') assert.match(i.problems[0]!.path, /^setups\[15\]\./);
});

test('unknown firmware imports with a warning', async () => {
  const lib = await open();
  const bytes = sndc16().slice();
  bytes[4 + 9 + 2] = 0x10 | 6; // firmware 02.06
  const i = lib.inspectImport(bytes);
  assert.equal(i.status, 'setup');
  assert.ok(i.status === 'setup' && i.warnings?.some((w) => /02\.06/.test(w)));
  const r = lib.importFile(bytes, { replace: true });
  assert.equal(r.status, 'imported');
  assert.match(r.message ?? '', /02\.06/);
});

test('the same Sndc twice in one file counts as one setup (the later wins)', async () => {
  const lib = await open();
  assert.equal(lib.inspectImport(new Uint8Array([...sndc16(), ...sndc16()])).status, 'setup');
});

test('a file with some but not 18 setups is refused', async () => {
  const lib = await open();
  // 18 setups, but cut to the first message's records so fewer slots are complete
  const i = lib.inspectImport(sndA().slice(0, 20000));
  assert.equal(i.status, 'refused');
});

test('a Sndc of SE16 placed into slot 3 is named for slot 3, or keeps the name of what it replaces', async () => {
  const lib = await open();
  lib.setSetupName('factory-se16', 'kick');
  assert.equal(lib.importFile(sndc16(), { slot: 3, replace: true }).status, 'imported');
  const three = lib.getState().configuration.setups.find((s) => s.slot === 3)!;
  assert.equal(three.name, 'SE03');
  assert.equal(setup16(lib).name, 'kick');
  const named = await open();
  named.setSetupName('factory-se03', 'bass');
  named.importFile(sndc16(), { slot: 3, replace: true });
  assert.equal(named.getState().configuration.setups.find((s) => s.slot === 3)!.name, 'bass');
});

import { readdirSync } from 'node:fs';
test('no fixture dump is refused by import', async () => {
  const lib = await open();
  for (const f of readdirSync(new URL('../fixtures/sysex/', import.meta.url)).filter((n) => n.endsWith('.syx'))) {
    const bytes = new Uint8Array(readFileSync(new URL(`../fixtures/sysex/${f}`, import.meta.url)));
    assert.notEqual(lib.inspectImport(bytes).status, 'refused', f);
  }
});

// --- unreadable values stay marked (plan 0005 decision 8 and 9) ---
const oddDump = () => withByte(sndc16(), 0x1c00 + 0x500 * 15, 0x7f);
const UNREADABLE = { path: 'setups[15].encoderGroups[0].encoders[0].type', message: 'unreadable in the dump, factory value shown' };
const unreadable = (lib: Library) => lib.getState().problems.filter((p) => p.message === UNREADABLE.message);
const enc16 = (lib: Library, index = 0) => ({ setupId: setup16(lib).id, area: 'encoders' as const, group: 0, index });

test('after import the unreadable value is still a problem of the library, and counted for its setup', async () => {
  const lib = await open();
  lib.importFile(oddDump(), { replace: true });
  assert.deepEqual(unreadable(lib), [UNREADABLE]);
  assert.equal(lib.getState().setups[15]!.problemCount, 1);
});

test('the mark goes away when its value is edited (even to the same value), and comes back with undo', async () => {
  const lib = await open();
  lib.importFile(oddDump(), { replace: true });
  const factoryType = factorySetup(16).encoderGroups[0]!.encoders[0]!.type;
  lib.setProperty(enc16(lib), 'type', factoryType);
  assert.deepEqual(unreadable(lib), []);
  lib.undo();
  assert.deepEqual(unreadable(lib), [UNREADABLE]);
  lib.redo();
  assert.deepEqual(unreadable(lib), []);
});

test('editing another property of the same control keeps the mark of the unreadable one', async () => {
  const lib = await open();
  lib.importFile(oddDump(), { replace: true });
  lib.setProperty(enc16(lib), 'channel', 5);
  assert.deepEqual(unreadable(lib), [UNREADABLE]);
  lib.setProperty(enc16(lib), 'type', 'CCr1');
  assert.deepEqual(unreadable(lib), []);
});

test('editing another control keeps the mark', async () => {
  const lib = await open();
  lib.importFile(oddDump(), { replace: true });
  lib.setProperty(enc16(lib, 1), 'channel', 5);
  assert.equal(unreadable(lib).length, 1);
});

test('undoing the import removes the mark', async () => {
  const lib = await open();
  lib.importFile(oddDump(), { replace: true });
  lib.undo();
  assert.deepEqual(unreadable(lib), []);
});

test('resetting the group or the setup, or replacing the setup, clears the mark', async () => {
  const group = await open();
  group.importFile(oddDump(), { replace: true });
  group.resetEncoderGroup(setup16(group).id, 0);
  assert.deepEqual(unreadable(group), []);
  const whole = await open();
  whole.importFile(oddDump(), { replace: true });
  whole.resetSetup(setup16(whole).id);
  assert.deepEqual(unreadable(whole), []);
  const replaced = await open();
  replaced.importFile(oddDump(), { replace: true });
  replaced.importFile(sndc16(), { replace: true });
  assert.deepEqual(unreadable(replaced), []);
});

test('the mark is saved with the library and comes back; the JSON export does not carry it', async () => {
  const storage = memoryStorage();
  const lib = (await openLibrary(storage, { now: clock })).library;
  lib.importFile(oddDump(), { replace: true });
  await lib.whenSaved();
  const again = (await openLibrary(storage, { now: clock })).library;
  assert.deepEqual(unreadable(again), [UNREADABLE]);
  const clean = await open();
  clean.importFile(lib.exportWhole().file!.text);
  assert.deepEqual(unreadable(clean), []);
  const old = (await openLibrary(memoryStorage(storage.text()), { now: clock })).library;
  assert.deepEqual(unreadable(old), [], 'a library saved without marks loads with none');
});

test('a mark follows its setup when the library is replaced by a whole dump with the odd value', async () => {
  const lib = await open();
  lib.importFile(withByte(sndA(), 0x1c00 + 0x500 * 15, 0x7f));
  assert.deepEqual(unreadable(lib), [UNREADABLE]);
});

test('resetAll clears unreadable marks (a mark alone counts as differing) and undo brings them back', async () => {
  const lib = await open();
  const odd = withByte(sndc16(), 0x1c00 + 0x500 * 15, 0x7f);
  lib.importFile(odd, { replace: true });
  const s = lib.getState();
  assert.equal(s.setups[15]!.problemCount, 1);
  assert.equal(s.setups[15]!.differsFromFactory, false, 'content is factory, only the mark remains');
  assert.equal(s.differsFromFactory, true);
  lib.resetAll();
  assert.equal(lib.getState().setups[15]!.problemCount, 0);
  assert.equal(lib.getState().differsFromFactory, false);
  lib.undo();
  assert.equal(lib.getState().setups[15]!.problemCount, 1);
});
