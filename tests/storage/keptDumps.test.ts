// Kept dumps and rollback (plan 0005 step 2): every imported dump is kept unchanged beside the library.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openLibrary, memoryStorage } from '../../src/storage/index.ts';
import type { Library } from '../../src/storage/index.ts';
import { factorySetup } from '../../src/model/index.ts';
import { parseFrame, writeFrame } from '../../src/protocol/frame.ts';

const clock = () => new Date('2026-11-15T10:00:00.000Z');
const fixture = (n: string): Uint8Array => new Uint8Array(readFileSync(new URL(`../fixtures/sysex/${n}.syx`, import.meta.url)));
const sndA = () => fixture('factory-SndA');
const sndc16 = () => fixture('base');
const openWith = async (storage = memoryStorage()) => ({ lib: (await openLibrary(storage, { now: clock })).library, storage });
const open = async (): Promise<Library> => (await openWith()).lib;
const setup16 = (lib: Library) => lib.getState().configuration.setups.find((s) => s.slot === 16)!;
const enc16 = (lib: Library, index = 0) => ({ setupId: setup16(lib).id, area: 'encoders' as const, group: 0, index });

function withByte(bytes: Uint8Array, address: number, value: number): Uint8Array {
  const r = parseFrame(bytes);
  assert.ok(r.ok);
  const rec = r.frame.records.find((x) => address >= x.address && address < x.address + x.data.length)!;
  rec.data[address - rec.address] = value;
  rec.sumInDump = rec.sumComputed = rec.data.reduce((a, v) => (a + v) & 0xffff, 0);
  return writeFrame(r.frame);
}
const odd = () => withByte(sndc16(), 0x1c00 + 0x500 * 15, 0x7f);

test('an imported SndA is kept with its date, source, type, slots and firmware, and every setup is linked to it', async () => {
  const lib = await open();
  lib.importFile(sndA(), { fileName: 'backup.syx' });
  const [d] = lib.getState().dumps;
  assert.ok(d);
  assert.deepEqual(
    { source: d.source, fileName: d.fileName, type: d.type, firmware: d.firmware, date: d.date, content: d.content, size: d.size },
    { source: 'file', fileName: 'backup.syx', type: 'all', firmware: '02.05', date: '2026-11-15T10:00:00.000Z', content: 'all 18 setups', size: sndA().length },
  );
  assert.deepEqual(d.slots, Array.from({ length: 18 }, (_, i) => i + 1));
  assert.equal('bytes' in d, false, 'the list has no bytes');
  assert.equal(Object.keys(lib.getState().dumpLinks).length, 18);
  assert.equal(lib.getState().dumpLinks['factory-se16'], d.id);
});

test('keeping is not an undo step: undo drops the links, the dump stays', async () => {
  const lib = await open();
  lib.importFile(sndc16(), { replace: true });
  lib.undo();
  assert.equal(lib.getState().dumps.length, 1);
  assert.deepEqual(lib.getState().dumpLinks, {});
  assert.equal(lib.getState().canUndo, false);
});

test('the same bytes imported again are one kept dump', async () => {
  const lib = await open();
  lib.importFile(sndc16(), { replace: true });
  lib.importFile(sndc16(), { replace: true });
  assert.equal(lib.getState().dumps.length, 1);
});

test('a refused or JSON import keeps nothing', async () => {
  const lib = await open();
  lib.importFile(sndc16().slice(0, 100));
  lib.importFile(lib.exportSetup('factory-se05').file!.text);
  assert.deepEqual(lib.getState().dumps, []);
});

test('a kept dump exports as it came, named by content and date', async () => {
  const lib = await open();
  lib.importFile(sndA());
  lib.importFile(sndc16(), { replace: true });
  const [one, all] = [lib.getState().dumps.find((d) => d.type === 'one')!, lib.getState().dumps.find((d) => d.type === 'all')!];
  const a = lib.exportDump(all.id);
  assert.deepEqual(a.file!.bytes, sndA());
  assert.equal(a.file!.name, 'uc4-all-2026-11-15.syx');
  const b = lib.exportDump(one.id);
  assert.deepEqual(b.file!.bytes, sndc16());
  assert.equal(b.file!.name, 'uc4-SE16-2026-11-15.syx');
  assert.equal(lib.exportDump('nope').file, undefined);
  assert.ok(lib.exportDump('nope').message);
});

test('reverting a setup to its dump is one undo step; the name stays', async () => {
  const lib = await open();
  lib.importFile(sndc16(), { replace: true });
  lib.setProperty(enc16(lib), 'channel', 9);
  lib.setSetupName(setup16(lib).id, 'kick');
  const edited = lib.getState().configuration;
  const r = lib.revertSetup(setup16(lib).id);
  assert.equal(r.message?.includes('kick'), true);
  assert.deepEqual({ ...setup16(lib), name: 'x' }, { ...factorySetup(16), name: 'x', id: setup16(lib).id });
  assert.equal(setup16(lib).name, 'kick');
  lib.undo();
  assert.equal(lib.getState().configuration, edited);
});

test('reverting re-derives the marks of unreadable values', async () => {
  const lib = await open();
  lib.importFile(odd(), { replace: true });
  const marked = () => lib.getState().problems.filter((p) => /unreadable/.test(p.message)).length;
  assert.equal(marked(), 1);
  lib.setProperty(enc16(lib), 'type', 'CCr1');
  assert.equal(marked(), 0);
  lib.revertSetup(setup16(lib).id);
  assert.equal(marked(), 1);
  lib.undo();
  assert.equal(marked(), 0);
});

test('reverting a setup that has no dump is refused', async () => {
  const lib = await open();
  const r = lib.revertSetup('factory-se01');
  assert.match(r.message ?? '', /no kept dump/i);
  assert.equal(lib.getState().canUndo, false);
});

test('deleting a dump removes it and the links to it; setups stay as they are', async () => {
  const lib = await open();
  lib.importFile(sndA());
  const id = lib.getState().dumps[0]!.id;
  const before = lib.getState().configuration;
  const r = lib.deleteDump(id);
  assert.match(r.message ?? '', /18 setups/);
  assert.deepEqual(lib.getState().dumps, []);
  assert.deepEqual(lib.getState().dumpLinks, {});
  assert.equal(lib.getState().configuration, before);
  assert.match(lib.revertSetup('factory-se16').message ?? '', /no kept dump/i);
  lib.undo();
  assert.deepEqual(lib.getState().dumpLinks, {}, 'undo does not bring a link to a deleted dump back');
  assert.ok(lib.deleteDump('nope').message);
});

test('kept dumps and links are saved and come back; a delete is saved too', async () => {
  const { lib, storage } = await openWith();
  lib.importFile(sndA());
  lib.importFile(sndc16(), { replace: true });
  await lib.whenSaved();
  assert.deepEqual(storage.dumps().map((d) => d.bytes.length).sort(), [sndA().length, sndc16().length].sort());
  const again = (await openWith(storage)).lib;
  assert.equal(again.getState().dumps.length, 2);
  assert.equal(again.getState().dumpLinks['factory-se16'], lib.getState().dumpLinks['factory-se16']);
  assert.deepEqual(again.exportDump(again.getState().dumps.find((d) => d.type === 'one')!.id).file!.bytes, sndc16());
  again.deleteDump(again.getState().dumps[0]!.id);
  await again.whenSaved();
  assert.equal(storage.dumps().length, 1);
});

test('keepDump keeps a received dump without touching the library, and says what it holds', async () => {
  const lib = await open();
  const before = lib.getState().configuration;
  const r = lib.keepDump(sndc16(), 'received');
  assert.equal(r.status, 'kept');
  if (r.status !== 'kept') return;
  assert.deepEqual([r.content, r.slots, r.dump.source, r.dump.type], ['SE16', [16], 'received', 'one']);
  assert.equal(lib.getState().configuration, before);
  assert.deepEqual(lib.getState().dumpLinks, {});
  assert.equal(lib.getState().canUndo, false);
  // reviewing it later is an ordinary import of the same bytes: linked to the kept dump, not kept twice
  lib.importFile(sndc16(), { replace: true });
  assert.equal(lib.getState().dumps.length, 1);
  assert.equal(lib.getState().dumpLinks[setup16(lib).id], r.dump.id);
  assert.equal(lib.getState().dumps[0]!.source, 'received');
});

test('keepDump of a file refuses what is not a readable dump and keeps nothing', async () => {
  const lib = await open();
  const bad = lib.keepDump(sndc16().slice(0, 100), 'file');
  assert.equal(bad.status, 'refused');
  assert.equal(lib.keepDump(new TextEncoder().encode('hello'), 'received').status, 'refused');
  assert.deepEqual(lib.getState().dumps, []);
});

test('a JSON import that replaces a setup drops its link', async () => {
  const lib = await open();
  lib.importFile(sndc16(), { replace: true });
  const file = lib.exportSetup(setup16(lib).id).file!.text;
  lib.importFile(file, { replace: true });
  assert.equal(lib.getState().dumpLinks[setup16(lib).id], undefined);
  assert.equal(lib.getState().dumps.length, 1);
});

test('a Sndc of SE16 imported into slot 3 reverts to the dump\'s SE16, name kept', async () => {
  const lib = await open();
  lib.importFile(sndc16(), { slot: 3, replace: true });
  const three = () => lib.getState().configuration.setups.find((s) => s.slot === 3)!;
  lib.setSetupName(three().id, 'bass');
  lib.setProperty({ setupId: three().id, area: 'encoders', group: 0, index: 0 }, 'channel', 9);
  lib.revertSetup(three().id);
  assert.equal(three().name, 'bass');
  assert.equal(three().slot, 3);
  assert.deepEqual({ ...three(), id: 'x', name: 'x', slot: 16 }, { ...factorySetup(16), id: 'x', name: 'x' });
});

test('dump ids are never reused: undo cannot link a setup to another dump', async () => {
  const lib = await open();
  lib.importFile(sndc16(), { replace: true });
  const a = lib.getState().dumps[0]!.id;
  lib.deleteDump(a);
  lib.importFile(odd(), { replace: true });
  const b = lib.getState().dumps[0]!.id;
  assert.notEqual(a, b);
  lib.undo();
  assert.deepEqual(Object.values(lib.getState().dumpLinks).filter((d) => d === b), []);
});

test('a whole JSON import drops every link', async () => {
  const lib = await open();
  lib.importFile(sndA());
  const json = lib.exportWhole().file!.text;
  lib.importFile(json);
  assert.deepEqual(lib.getState().dumpLinks, {});
  assert.equal(lib.getState().dumps.length, 1);
});

test('a dump that cannot be saved says it is kept for this session only', async () => {
  const { lib, storage } = await openWith();
  storage.putDump = async () => { throw new Error('storage is full'); };
  lib.importFile(sndc16(), { replace: true });
  await lib.whenSaved();
  assert.match(lib.getState().message ?? '', /this session only/);
  assert.equal(lib.getState().dumps.length, 1);
});

test('a received dump the engine refuses is kept all the same: unreadable, exportable, deletable, never linked', async () => {
  const lib = await open();
  const bad = sndc16().slice();
  bad[bad.length - 30] = (bad[bad.length - 30]! + 1) & 0x7f;
  const r = lib.keepDump(bad, 'received');
  assert.equal(r.status, 'kept');
  if (r.status !== 'kept') return;
  assert.ok(r.unreadable?.reason && r.unreadable.whatToDo);
  assert.deepEqual([r.slots, r.content, r.dump.type, r.dump.unreadable !== undefined], [[], 'unreadable dump', 'unknown', true]);
  assert.equal(lib.getState().dumps.length, 1);
  assert.deepEqual(lib.getState().dumpLinks, {});
  assert.equal(lib.getState().canUndo, false);
  assert.deepEqual(lib.exportDump(r.dump.id).file!.bytes, bad);
  assert.equal(lib.exportDump(r.dump.id).file!.name, 'uc4-unreadable-2026-11-15.syx');
  assert.equal(lib.importFile(bad).status, 'refused');
  assert.equal(lib.getState().dumps.length, 1, 'importing it as a file does not keep it again');
  lib.deleteDump(r.dump.id);
  assert.deepEqual(lib.getState().dumps, []);
});

test('an unreadable received dump is saved and comes back; a refused file is not kept', async () => {
  const { lib, storage } = await openWith();
  const bad = sndc16().slice(0, 200);
  lib.keepDump(bad, 'received');
  lib.keepDump(bad.slice(0, 150), 'file');
  await lib.whenSaved();
  assert.equal(storage.dumps().length, 1);
  const again = (await openWith(storage)).lib;
  assert.ok(again.getState().dumps[0]!.unreadable);
});

test('bytes that are not SysEx at all are not kept, even when received', async () => {
  const lib = await open();
  assert.equal(lib.keepDump(new Uint8Array([1, 2, 3]), 'received').status, 'refused');
  assert.deepEqual(lib.getState().dumps, []);
});

test('resetAll keeps the dump links (Revert stays a way back), and undo restores them too', async () => {
  const lib = await open();
  lib.importFile(sndA(), { fileName: 'backup.syx' });
  const links = { ...lib.getState().dumpLinks };
  assert.ok(Object.keys(links).length > 0);
  lib.setSetupName('factory-se05', 'Live');
  lib.resetAll();
  assert.deepEqual(lib.getState().dumpLinks, links);
  assert.equal(lib.getState().dumps.length, 1);
  lib.undo();
  assert.deepEqual(lib.getState().dumpLinks, links);
});
