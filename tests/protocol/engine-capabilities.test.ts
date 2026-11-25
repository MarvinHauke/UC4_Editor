// Step 5 of plan 0004: capabilities() and canEncode(), driven by the profile tables, and checked against the gate of
// encode: whatever canEncode says yes to must encode without `unconfirmed-fields`, whatever it says no to must fail.
import { test } from 'vitest';
import './markOLikely.ts'; // first: marks `o` as likely so the gate has a field to block (see the helper)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { uc4Engine, ENGINE_VERSION } from '../../src/protocol/engine.ts';
import { faderfoxUc4 } from '../../src/protocol/profiles/uc4.ts';
import type { ControlKind, FieldId, Property } from '../../src/protocol/types.ts';
import type { Setup } from '../../src/model/types.ts';

const load = (n: string): Uint8Array => new Uint8Array(readFileSync(new URL(`../fixtures/sysex/${n}.syx`, import.meta.url)));
const src = { kind: 'file', name: 'x.syx' } as const;
const now = (): string => '2026-11-15T00:00:00.000Z';
const parsed = uc4Engine.parse(load('base'), src, now);
assert.ok(parsed.ok);
const baseMsg = parsed.messages[0]!;
const d0 = uc4Engine.decode(baseMsg);
assert.ok(d0.ok);
const baseSetup = d0.setups[0]!.setup;

// ---- capabilities ------------------------------------------------------------------------------------------------------

test('capabilities: identity, firmware and slot rules', () => {
  const c = uc4Engine.capabilities();
  assert.equal(c.engineVersion, ENGINE_VERSION);
  assert.equal(c.profile, 'faderfox-uc4');
  assert.deepEqual(c.knownFirmware, ['02.05']);
  assert.equal(c.slotPlacement, 'confirmed');
  assert.equal(c.slotMove, 'likely');
});

test('capabilities: controls summary reads the tables (null = no such property)', () => {
  const c = uc4Engine.capabilities();
  assert.equal(c.controls.pushButton.display, null);
  assert.equal(c.controls.encoder.number, 'confirmed');
  assert.equal(c.controls.encoder.type, 'confirmed');        // g1c1 and g8c8 (enc8g8-CCr1)
  assert.equal(c.controls.pushButton.number, 'confirmed');  // order proved by combined-se16
  assert.equal(c.controls.greenButton.mode, 'confirmed');
  assert.equal(c.controls.fader.display, 'confirmed');
  assert.equal(c.fader9.channel, 'confirmed');
  assert.equal(c.fader9.type, 'confirmed');                  // all four codes (fad9g1-*)
  assert.equal(c.fader9.mode, 'confirmed');
});

test('capabilities: per code (decision 17) and per name character and position', () => {
  const c = uc4Engine.capabilities();
  const code = (control: ControlKind | 'fader9', property: Property, value: string): string | undefined =>
    c.codes.find((x) => x.control === control && x.property === property && x.value === value)?.confidence;
  assert.equal(code('fader9', 'type', 'CCAb'), 'confirmed');
  assert.equal(code('fader9', 'type', 'PrGC'), 'confirmed');
  assert.equal(code('fader9', 'type', 'Pbnd'), 'confirmed');
  assert.equal(code('fader9', 'type', 'AFtt'), 'confirmed');
  assert.equal(code('fader9', 'display', 'bPoL'), 'confirmed');
  assert.equal(code('fader9', 'mode', 'JMP'), 'confirmed');
  assert.equal(code('encoder', 'type', 'Pbnd'), 'confirmed');
  assert.equal(code('greenButton', 'type', 'OFF'), undefined); // no OFF on a green button
  assert.equal(c.nameCharacters.find((n) => n.char === 'z')!.confidence, 'confirmed');
  assert.equal(c.nameCharacters.find((n) => n.char === 'e')!.confidence, 'confirmed');
  assert.equal(c.nameCharacters.find((n) => n.char === 'o')!.confidence, 'likely');
  assert.equal(c.nameCharacters.length, 39);
  assert.equal(c.namePositions.length, 32);
  assert.ok(c.namePositions.every((p) => p.confidence === 'confirmed'));
});

test('capabilities returns a copy: changing it does not change the engine', () => {
  const c = uc4Engine.capabilities();
  c.slotMove = 'confirmed';
  c.controls.encoder.number = 'unknown';
  assert.equal(uc4Engine.capabilities().slotMove, 'likely');
  assert.equal(uc4Engine.capabilities().controls.encoder.number, 'confirmed');
});

// ---- canEncode: examples -------------------------------------------------------------------------------------------------

const ctl = (control: ControlKind, group: number, index: number, property: Property): FieldId => ({ what: 'control', control, group, index, property });

test('canEncode: positions', () => {
  assert.equal(uc4Engine.canEncode(ctl('encoder', 8, 8, 'number'), 5), true);
  assert.equal(uc4Engine.canEncode(ctl('encoder', 3, 4, 'type'), 'CCAb'), true);    // type confirmed at both ends (enc8g8-CCr1)
  assert.equal(uc4Engine.canEncode(ctl('encoder', 1, 1, 'type'), 'CCAh'), true);
  assert.equal(uc4Engine.canEncode(ctl('pushButton', 1, 1, 'number'), 5), true);
  assert.equal(uc4Engine.canEncode(ctl('pushButton', 1, 2, 'number'), 5), true);     // order confirmed (combined-se16)
  assert.equal(uc4Engine.canEncode(ctl('pushButton', 8, 8, 'mode'), 'toGL'), true);
  assert.equal(uc4Engine.canEncode(ctl('greenButton', 8, 8, 'mode'), 'toGL'), true);  // decision 12, combined-se16
  assert.equal(uc4Engine.canEncode(ctl('greenButton', 1, 1, 'mode'), 'toGL'), true);
  assert.equal(uc4Engine.canEncode(ctl('fader', 8, 8, 'display'), 'bPoL'), true);
  assert.equal(uc4Engine.canEncode(ctl('pushButton', 1, 1, 'display'), 'Std'), false); // push has no display
});

test('canEncode: codes and values', () => {
  assert.equal(uc4Engine.canEncode(ctl('fader', 3, 9, 'type'), 'PrGC'), true);
  assert.equal(uc4Engine.canEncode(ctl('fader', 3, 9, 'type'), 'Pbnd'), true);
  assert.equal(uc4Engine.canEncode(ctl('fader', 3, 9, 'type')), true);               // some code is writable
  assert.equal(uc4Engine.canEncode(ctl('greenButton', 1, 1, 'type'), 'OFF'), false);
  assert.equal(uc4Engine.canEncode(ctl('encoder', 1, 1, 'channel'), 16), true);
  assert.equal(uc4Engine.canEncode(ctl('encoder', 1, 1, 'channel'), 17), false);
  assert.equal(uc4Engine.canEncode(ctl('encoder', 1, 1, 'number'), 128), false);
  assert.equal(uc4Engine.canEncode(ctl('encoder', 1, 1, 'number'), 1.5), false);
  assert.equal(uc4Engine.canEncode(ctl('encoder', 1, 1, 'number'), 'x'), false);
});

test('canEncode: names and out-of-range fields', () => {
  assert.equal(uc4Engine.canEncode({ what: 'groupName', group: 1, char: 1 }, 'z'), true);
  assert.equal(uc4Engine.canEncode({ what: 'groupName', group: 1, char: 1 }, 'o'), false);   // o: likely
  assert.equal(uc4Engine.canEncode({ what: 'groupName', group: 3, char: 1 }, 'z'), true);    // every position is confirmed
  assert.equal(uc4Engine.canEncode({ what: 'groupName', group: 1, char: 2 }), true);
  assert.equal(uc4Engine.canEncode({ what: 'groupName', group: 9, char: 1 }, 'z'), false);
  assert.equal(uc4Engine.canEncode(ctl('encoder', 9, 1, 'number'), 1), false);
  assert.equal(uc4Engine.canEncode(ctl('encoder', 1, 9, 'number'), 1), false);
  assert.equal(uc4Engine.canEncode(ctl('fader', 1, 10, 'number'), 1), false);
  assert.equal(uc4Engine.canEncode(ctl('fader', 0, 1, 'number'), 1), false);
  assert.equal(uc4Engine.canEncode({ what: 'control', control: 'nope' as ControlKind, group: 1, index: 1, property: 'number' }, 1), false);
});

// ---- the property: canEncode agrees with the gate of encode --------------------------------------------------------------------

function setField(setup: Setup, f: FieldId, value: string | number): void {
  if (f.what === 'groupName') {
    const g = setup.encoderGroups[f.group - 1]!;
    const chars = [...g.name];
    chars[f.char - 1] = String(value);
    g.name = chars.join('');
    return;
  }
  const grp = f.control === 'encoder' || f.control === 'pushButton' ? setup.encoderGroups[f.group - 1]! : setup.faderButtonGroups[f.group - 1]!;
  const list = f.control === 'encoder' ? (grp as Setup['encoderGroups'][number]).encoders
    : f.control === 'pushButton' ? (grp as Setup['encoderGroups'][number]).pushButtons
    : f.control === 'greenButton' ? (grp as Setup['faderButtonGroups'][number]).buttons
    : (grp as Setup['faderButtonGroups'][number]).faders;
  (list[f.index - 1] as unknown as Record<string, string | number>)[f.property] = value;
}
function current(setup: Setup, f: FieldId): string | number {
  if (f.what === 'groupName') return [...setup.encoderGroups[f.group - 1]!.name][f.char - 1]!;
  const grp = f.control === 'encoder' || f.control === 'pushButton' ? setup.encoderGroups[f.group - 1]! : setup.faderButtonGroups[f.group - 1]!;
  const list = f.control === 'encoder' ? (grp as Setup['encoderGroups'][number]).encoders
    : f.control === 'pushButton' ? (grp as Setup['encoderGroups'][number]).pushButtons
    : f.control === 'greenButton' ? (grp as Setup['faderButtonGroups'][number]).buttons
    : (grp as Setup['faderButtonGroups'][number]).faders;
  return (list[f.index - 1] as unknown as Record<string, string | number>)[f.property]!;
}

/** Values to try for a property: every code of the table, plus plain values and out-of-range ones. */
function candidates(f: FieldId): Array<string | number> {
  if (f.what === 'groupName') return faderfoxUc4.nameCodes.map((n) => n.char);
  const fader9 = f.control === 'fader' && f.index === 9;
  const spec = (fader9 ? faderfoxUc4.fader9Fields : faderfoxUc4.fields.filter((s) => s.control === f.control)).find((s) => s.property === f.property)!;
  if (!spec) return ['Std']; // the push button has no display
  if (spec.codes) return [...spec.codes.map((c) => c.name), 'nope'];
  return f.property === 'channel' ? [1, 9, 16, 0, 17] : [0, 64, 127, 128, -1];
}

// 15 s: for runs under load, while several agents test at once.
test('canEncode agrees with encode: yes never ends in unconfirmed-fields, no always fails', () => {
  const props: Property[] = ['type', 'mode', 'display', 'channel', 'number', 'lower', 'upper'];
  // positions: both ends, a corner of each group axis and an interior one, in several groups
  const spots: Array<[number, number]> = [[1, 1], [1, 2], [2, 1], [1, 8], [8, 1], [8, 8], [4, 5], [7, 7]];
  const fields: FieldId[] = [];
  for (const control of ['encoder', 'pushButton', 'greenButton', 'fader'] as ControlKind[])
    for (const [g, i] of spots) for (const p of props) fields.push(ctl(control, g, i, p));
  for (const g of [1, 2, 6, 7, 8]) for (const p of props) fields.push(ctl('fader', g, 9, p));
  for (const g of [1, 2, 3, 8]) for (const c of [1, 2, 4]) fields.push({ what: 'groupName', group: g, char: c });
  let yes = 0, no = 0;
  for (const f of fields) {
    const hasSpec = f.what === 'groupName' || !(f.control === 'pushButton' && f.property === 'display');
    const tried: boolean[] = [];
    for (const v of candidates(f)) {
      if (v === current(baseSetup, f)) continue;
      const setup = structuredClone(baseSetup);
      if (!hasSpec) { assert.equal(uc4Engine.canEncode(f, v), false); continue; }
      setField(setup, f, v);
      const r = uc4Engine.encode({ setups: [{ slot: 16, setup }], base: baseMsg.raw, message: 'one' }, now);
      const can = uc4Engine.canEncode(f, v);
      tried.push(can);
      if (can) { assert.ok(r.ok, `${JSON.stringify(f)} = ${String(v)}: canEncode yes, encode ${r.ok ? '' : r.reason.code}`); yes++; }
      else { assert.ok(!r.ok, `${JSON.stringify(f)} = ${String(v)}: canEncode no, but encode wrote it`); no++; }
    }
    // without a value: yes exactly when some value of the candidates is writable
    if (hasSpec) assert.equal(uc4Engine.canEncode(f), tried.some(Boolean), JSON.stringify(f));
  }
  assert.ok(yes > 100 && no > 100, `yes ${yes}, no ${no}`);
}, 15_000);
