// `.syx` export from the library (plan 0007 step 3.2): base and source, refusals in the device's words,
// read back, file names, and the duplicate notice of `keepDump`.
import { test } from 'vitest';
import '../protocol/markOLikely.ts'; // first: marks `o` as likely so an edit is refused (the gate's test field)
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { openLibrary, memoryStorage } from '../../src/storage/index.ts';
import type { Library } from '../../src/storage/index.ts';
import { describeField, differences } from '../../src/storage/syxExport.ts';
import { ENGINE_VERSION, uc4Engine } from '../../src/protocol/engine.ts';
import { factorySetup } from '../../src/model/index.ts';
import { parseFrame, writeFrame } from '../../src/protocol/frame.ts';

const clock = () => new Date('2026-11-16T10:00:00.000Z');
const dir = new URL('../fixtures/sysex/', import.meta.url);
const fixture = (n: string): Uint8Array => new Uint8Array(readFileSync(new URL(`${n}.syx`, dir)));
const sndA = () => fixture('factory-SndA');
const sndc16 = () => fixture('base');
const open = async (): Promise<Library> => (await openLibrary(memoryStorage(), { now: clock })).library;
const setupAt = (lib: Library, slot: number) => lib.getState().configuration.setups.find((s) => s.slot === slot)!;
const enc = (lib: Library, slot: number, index = 0) => ({ setupId: setupAt(lib, slot).id, area: 'encoders' as const, group: 0, index });
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const decodeAll = (bytes: Uint8Array) => {
  const p = uc4Engine.parse(bytes, { kind: 'file', name: 'x' });
  assert.ok(p.ok);
  const d = uc4Engine.decode(p.messages[0]!);
  assert.ok(d.ok);
  return d.setups;
};
function withByte(bytes: Uint8Array, address: number, value: number): Uint8Array {
  const r = parseFrame(bytes);
  assert.ok(r.ok);
  const rec = r.frame.records.find((x) => address >= x.address && address < x.address + x.data.length)!;
  rec.data[address - rec.address] = value;
  rec.sumInDump = rec.sumComputed = rec.data.reduce((a, v) => (a + v) & 0xffff, 0);
  return writeFrame(r.frame);
}

// --- one setup (Sndc) ---

test('an unchanged setup from a kept Sndc exports as exactly that dump, under its plain name', async () => {
  const lib = await open();
  lib.importFile(sndc16(), { replace: true });
  const r = lib.exportSetupSyx(setupAt(lib, 16).id);
  assert.equal(r.refusal, undefined);
  assert.ok(r.file);
  assert.ok(same(r.file.bytes, sndc16()));
  assert.equal(r.file.name, 'uc4-SE16-2026-11-16.syx');
});

test('an edited setup exports as a Sndc of its slot with the engine version in the name, and reads back as the edit', async () => {
  const lib = await open();
  lib.importFile(sndc16(), { replace: true });
  lib.setProperty(enc(lib, 16), 'mode', 'Acc1');
  const r = lib.exportSetupSyx(setupAt(lib, 16).id);
  assert.ok(r.file, r.message);
  assert.equal(r.file.name, `uc4-SE16-2026-11-16-engine${ENGINE_VERSION}.syx`);
  assert.ok(!same(r.file.bytes, sndc16()));
  const [d] = decodeAll(r.file.bytes);
  assert.equal(d!.slot, 16);
  assert.equal(d!.setup.encoderGroups[0]!.encoders[0]!.mode, 'Acc1');
  assert.equal(r.state.dumps.length, 1, 'exporting keeps nothing');
});

test('a setup that was never kept from a Sndc cannot be a Sndc yet: a message, no file, JSON as the way out', async () => {
  const lib = await open();
  lib.setProperty(enc(lib, 5), 'mode', 'Acc1');
  const r = lib.exportSetupSyx(setupAt(lib, 5).id);
  assert.equal(r.file, undefined);
  assert.match(r.refusal!.reason, /SE05 cannot be written as a single setup/);
  assert.match(r.refusal!.whatToDo, /^Send SE05 from the UC4 once \(Sndc: setup mode, encoder 4\), then export again\./);
  assert.match(r.refusal!.whatToDo, /Export all setups as \.syx, or export as JSON instead\.$/);
  assert.match(r.refusal!.whatToDo, /JSON/);
  assert.equal(r.message, `${r.refusal!.reason} ${r.refusal!.whatToDo}`);
});

test('a setup from a SndA is not a Sndc base either (the engine builds a Sndc only on a Sndc)', async () => {
  const lib = await open();
  lib.importFile(sndA());
  const r = lib.exportSetupSyx(setupAt(lib, 3).id);
  assert.equal(r.file, undefined);
  assert.match(r.refusal!.reason, /SE03 cannot be written as a single setup/);
});

test('an unconfirmed edit refuses the file and names the field in the device\'s words', async () => {
  const lib = await open();
  lib.importFile(sndc16(), { replace: true });
  lib.setGroupName(setupAt(lib, 16).id, 3, 'oooo');
  const r = lib.exportSetupSyx(setupAt(lib, 16).id);
  assert.equal(r.file, undefined);
  assert.ok(r.refusal!.fields.some((f) => f.startsWith('name of encoder group 4')), r.refusal!.fields.join('|'));
  assert.match(r.refusal!.reason, /cannot write to the UC4 yet/);
  assert.match(r.refusal!.whatToDo, /export as json instead/i);
  assert.ok(lib.getState().message?.includes('name of encoder group 4'));
});

test('a setup without a slot exports as JSON only, with a note', async () => {
  const lib = await open();
  const doc = JSON.parse(lib.exportWhole().file!.text) as { setups: Array<{ slot?: number }> };
  delete doc.setups[3]!.slot;
  lib.importFile(JSON.stringify(doc));
  const loose = lib.getState().configuration.setups.find((s) => s.slot === undefined)!;
  const r = lib.exportSetupSyx(loose.id);
  assert.equal(r.file, undefined);
  assert.match(r.refusal!.reason, /has no slot/);
  assert.match(r.refusal!.whatToDo, /Export as JSON instead/);
});

test('an unknown setup id is a message, not an exception', async () => {
  const lib = await open();
  const r = lib.exportSetupSyx('nope');
  assert.equal(r.file, undefined);
  assert.match(r.message!, /no setup/);
});

// --- all 18 (SndA) ---

test('a fresh library exports a SndA from the factory image, named with the engine version', async () => {
  const lib = await open();
  const r = lib.exportAllSyx();
  assert.ok(r.file, r.message);
  assert.equal(r.file.name, `uc4-all-2026-11-16-engine${ENGINE_VERSION}.syx`);
  assert.deepEqual(decodeAll(r.file.bytes).map((d) => d.slot), Array.from({ length: 18 }, (_, i) => i + 1));
  assert.ok(same(r.file.bytes, sndA()), 'the factory library is the factory SndA');
});

test('an unchanged library imported from a SndA exports as that dump, under its plain name', async () => {
  const lib = await open();
  lib.importFile(sndA());
  const r = lib.exportAllSyx();
  assert.ok(r.file);
  assert.ok(same(r.file.bytes, sndA()));
  assert.equal(r.file.name, 'uc4-all-2026-11-16.syx');
});

test('a SndA made of setups from different dumps keeps each setup\'s dump (Sndc SE16 over a SndA)', async () => {
  const lib = await open();
  lib.importFile(sndA());
  lib.importFile(sndc16(), { replace: true });
  lib.setProperty(enc(lib, 16), 'mode', 'Acc1');
  const r = lib.exportAllSyx();
  assert.ok(r.file, r.message);
  const all = decodeAll(r.file.bytes);
  assert.equal(all.length, 18);
  assert.equal(all.find((d) => d.slot === 16)!.setup.encoderGroups[0]!.encoders[0]!.mode, 'Acc1');
});

test('a library with a slot missing refuses the SndA and says which', async () => {
  const lib = await open();
  const doc = JSON.parse(lib.exportWhole().file!.text) as { setups: unknown[] };
  doc.setups.splice(4, 1);
  lib.importFile(JSON.stringify(doc));
  const r = lib.exportAllSyx();
  assert.equal(r.file, undefined);
  assert.match(r.refusal!.reason, /SE05 has no setup/);
  assert.match(r.refusal!.whatToDo, /JSON/);
});

test('an unconfirmed edit in any setup refuses the SndA, with the slot in front of the field', async () => {
  const lib = await open();
  lib.setGroupName(setupAt(lib, 7).id, 3, 'oooo');
  const r = lib.exportAllSyx();
  assert.equal(r.file, undefined);
  assert.ok(r.refusal!.fields.some((f) => f.startsWith('SE07 name of encoder group 4')), r.refusal!.fields.join('|'));
});

// --- every fixture round-trips unchanged ---

const fixtures = readdirSync(dir).filter((f) => f.endsWith('.syx')).map((f) => f.replace(/\.syx$/, ''));
// 15 s: for runs under load, while several agents test at once.
test('every fixture dump, imported and exported again without an edit, comes out byte-identical', async () => {
  let checked = 0;
  for (const name of fixtures) {
    const bytes = fixture(name);
    const lib = await open();
    const inspected = lib.inspectImport(bytes);
    if (inspected.status === 'refused') continue;
    lib.importFile(bytes, { replace: true });
    if (lib.getState().problems.length > 0) continue; // unreadable values: refused by design
    const r = inspected.status === 'whole' ? lib.exportAllSyx() : lib.exportSetupSyx(lib.getState().configuration.setups.find((s) => s.slot === inspected.slot)!.id);
    assert.ok(r.file, `${name}: ${r.message}`);
    assert.ok(same(r.file.bytes, bytes), `${name} is not byte-identical`);
    checked++;
  }
  assert.ok(checked >= 20, `only ${checked} fixtures checked`);
}, 15_000);

// --- words and read back ---

test('describeField names controls as the device does', () => {
  assert.equal(describeField({ what: 'control', control: 'encoder', group: 2, index: 3, property: 'type' }), 'Enc3 of encoder group 2: Command type');
  assert.equal(describeField({ what: 'control', control: 'pushButton', group: 1, index: 8, property: 'mode' }), 'Pbt8 of encoder group 1: Button mode');
  assert.equal(describeField({ what: 'control', control: 'greenButton', group: 4, index: 1, property: 'display' }), 'btn1 of fader/button group 4: LED');
  assert.equal(describeField({ what: 'control', control: 'fader', group: 5, index: 9, property: 'upper' }), 'FAd9 of fader/button group 5: Upper value');
  assert.equal(describeField({ what: 'groupName', group: 3, char: 2 }), 'name of encoder group 3, character 2');
});

test('differences names what a file does not hold, and ignores what the editor alone keeps', () => {
  const a = factorySetup(1);
  assert.deepEqual(differences(a, { ...a, name: 'Other', id: 'x' }), []);
  const b = structuredClone(a);
  b.faderButtonGroups[4]!.faders[8]!.number = 99;
  b.encoderGroups[1]!.name = 'ZZZZ';
  assert.deepEqual(differences(a, b), ['FAd9 of fader/button group 5: Number', 'name of encoder group 2']);
});

// --- keepDump: the same bytes again ---

test('keeping bytes that are already kept says so, with the earlier dump and its date', async () => {
  const lib = await open();
  const first = lib.keepDump(sndc16(), 'received');
  assert.equal(first.status, 'kept');
  assert.equal(first.status === 'kept' && first.duplicateOf, undefined);
  const again = lib.keepDump(sndc16(), 'received');
  assert.equal(again.status, 'kept');
  if (again.status !== 'kept' || first.status !== 'kept') return;
  assert.deepEqual(again.duplicateOf, { id: first.dump.id, date: first.dump.date });
  assert.equal(lib.getState().dumps.length, 1);
});

test('an unreadable dump kept twice also says it is the same', async () => {
  const lib = await open();
  const junk = new Uint8Array([0xf0, 0x00, 0x20, 0x7f, 0x01, 0xf7]);
  const first = lib.keepDump(junk, 'received');
  const again = lib.keepDump(junk, 'received');
  assert.ok(first.status === 'kept' && again.status === 'kept');
  assert.equal(first.status === 'kept' && first.duplicateOf, undefined);
  assert.equal(again.status === 'kept' && again.duplicateOf?.id, first.status === 'kept' ? first.dump.id : '');
});

test('a setup with an unreadable value still exports when it has its dump: the dump\'s byte survives', async () => {
  const lib = await open();
  const odd = withByte(sndc16(), 0x1c00 + 0x500 * 15, 0x7f);
  lib.importFile(odd, { replace: true });
  assert.ok(lib.getState().problems.length > 0);
  const one = lib.exportSetupSyx(setupAt(lib, 16).id);
  assert.ok(one.file, one.message);
  assert.ok(same(one.file.bytes, odd), 'the unreadable byte is still the dump\'s');
  lib.importFile(sndA());
  lib.importFile(odd, { replace: true });
  const all = lib.exportAllSyx();
  assert.ok(all.file, all.message);
  assert.ok(decodeAll(all.file.bytes).length === 18);
});

test('an unreadable value without a dump to keep it is refused', async () => {
  const lib = await open();
  lib.importFile(withByte(sndc16(), 0x1c00 + 0x500 * 15, 0x7f), { replace: true });
  const link = lib.getState().dumpLinks[setupAt(lib, 16).id]!;
  lib.deleteDump(link);
  const r = lib.exportSetupSyx(setupAt(lib, 16).id);
  assert.equal(r.file, undefined);
  assert.match(r.refusal!.reason, /could not read from its dump/);
});
