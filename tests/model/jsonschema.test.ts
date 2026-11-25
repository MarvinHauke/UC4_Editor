// The published JSON Schema against the types (through the same constants), the factory setups and
// the validator's verdicts (plan 0002 step 5).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSchema, factorySetup, load, nameProblems, save, validate, FORMAT, NAME_CHARS, SCHEMA_VERSION } from '../../src/model/index.ts';
import type { Uc4Config } from '../../src/model/index.ts';
import { check } from './jsonschema-lite.ts';

const file = JSON.parse(readFileSync(new URL('../../schema/uc4-config.schema.json', import.meta.url), 'utf8')) as Record<string, unknown>;
const config = (slots: number[]): Uc4Config => ({
  format: FORMAT, schemaVersion: SCHEMA_VERSION, device: { profile: 'faderfox-uc4' },
  createdAt: '2026-11-13T10:00:00Z', updatedAt: '2026-11-13T10:00:00Z', setups: slots.map(factorySetup),
});
const clone = (c: Uc4Config): Uc4Config => JSON.parse(JSON.stringify(c)) as Uc4Config;

test('the published schema is the one built from the types (rewrite it with: node tools/uc4-config.ts schema > schema/uc4-config.schema.json)', () => {
  assert.deepEqual(file, JSON.parse(JSON.stringify(buildSchema())));
});

test('the schema accepts the factory setups of all 18 slots', () => {
  for (let slot = 1; slot <= 18; slot++) assert.deepEqual(check(file, JSON.parse(save(config([slot])))), [], `SE${slot}`);
  const all = Array.from({ length: 18 }, (_, i) => i + 1);
  assert.deepEqual(check(file, JSON.parse(save(config(all)))), []);
});

test('a file with a $schema line is accepted by schema and validator', () => {
  const c = { ...config([3]), $schema: '../schema/uc4-config.schema.json' };
  assert.deepEqual(check(file, JSON.parse(save(c))), []);
  assert.deepEqual(validate(c), []);
  const r = load(save(c));
  assert.equal(r.status === 'loaded' && r.problems.length, 0);
  assert.ok(save(c).split('\n')[1]!.startsWith('  "$schema"'));
});

// What the schema flags, the validator flags too (and the other way round for what a schema can say).
type Edit = (c: Uc4Config) => void;
const wrong: [string, Edit][] = [
  ['channel 17', (c) => { c.setups[0]!.encoderGroups[0]!.encoders[3]!.channel = 17; }],
  ['channel 0', (c) => { c.setups[0]!.faderButtonGroups[0]!.buttons[0]!.channel = 0; }],
  ['number 200', (c) => { c.setups[0]!.faderButtonGroups[2]!.buttons[7]!.number = 200; }],
  ['upper -1', (c) => { c.setups[0]!.encoderGroups[1]!.pushButtons[1]!.upper = -1; }],
  ['a fractional number', (c) => { c.setups[0]!.encoderGroups[0]!.encoders[0]!.number = 1.5; }],
  ['a fader with CCr1', (c) => { (c.setups[0]!.faderButtonGroups[0]!.faders[0]! as { type: string }).type = 'CCr1'; }],
  ['a green button with OFF', (c) => { (c.setups[0]!.faderButtonGroups[0]!.buttons[0]! as { type: string }).type = 'OFF'; }],
  ['an encoder with the mode JMP', (c) => { (c.setups[0]!.encoderGroups[0]!.encoders[0]! as { mode: string }).mode = 'JMP'; }],
  ['a push button with a display', (c) => { (c.setups[0]!.encoderGroups[0]!.pushButtons[0]! as unknown as Record<string, unknown>).display = 'Std'; }],
  ['7 encoders', (c) => { c.setups[0]!.encoderGroups[1]!.encoders.pop(); }],
  ['9 encoder groups', (c) => { c.setups[0]!.encoderGroups.push(c.setups[0]!.encoderGroups[0]!); }],
  ['a missing property', (c) => { delete (c.setups[0]!.encoderGroups[0]!.encoders[0]! as unknown as Record<string, unknown>).lower; }],
  ['a 5-character group name', (c) => { c.setups[0]!.encoderGroups[0]!.name = 'snare'; }],
  ['a group name with k', (c) => { c.setups[0]!.encoderGroups[0]!.name = 'kick'; }],
  ['a group name with w', (c) => { c.setups[0]!.encoderGroups[0]!.name = 'wow1'; }],
  ['a group name with v', (c) => { c.setups[0]!.encoderGroups[0]!.name = 'viol'; }],
  ['a group name in upper case', (c) => { c.setups[0]!.encoderGroups[0]!.name = 'GRP1'; }],
  ['CCAh and number 100', (c) => { const e = c.setups[0]!.encoderGroups[3]!.encoders[2]!; e.type = 'CCAh'; e.number = 100; }],
  ['a slot of 19', (c) => { c.setups[0]!.slot = 19; }],
  ['an unknown field', (c) => { (c.setups[0]! as unknown as Record<string, unknown>).colour = 'red'; }],
  ['another device profile', (c) => { (c.device as { profile: string }).profile = 'ec4'; }],
  ['no setups', (c) => { c.setups = []; }],
];
for (const [situation, edit] of wrong) {
  test(`${situation}: schema and validator both object`, () => {
    const c = clone(config([1]));
    edit(c);
    assert.ok(check(file, JSON.parse(JSON.stringify(c))).length > 0, 'schema');
    assert.ok(validate(c).length > 0, 'validator');
  });
}

test('schema and validator agree on every printable character in a group name', () => {
  for (let code = 0x20; code <= 0x7e; code++) {
    const ch = String.fromCharCode(code);
    const c = clone(config([1]));
    c.setups[0]!.encoderGroups[0]!.name = `a${ch}bc`;
    const schemaOk = check(file, JSON.parse(JSON.stringify(c))).length === 0;
    assert.equal(schemaOk, nameProblems(c.setups[0]!.encoderGroups[0]!.name).length === 0, `"${ch}"`);
    assert.equal(schemaOk, NAME_CHARS.has(ch), `"${ch}"`);
  }
});

test('a file with every optional field set is accepted by schema and validator', () => {
  const c = config([1]);
  c.$schema = '../schema/uc4-config.schema.json';
  c.device.firmware = '02.05';
  const s = c.setups[0]!;
  s.notes = 'for the club';
  s.encoderGroups[0]!.label = 'Mix';
  s.encoderGroups[0]!.encoders[0]!.label = 'Cutoff';
  s.encoderGroups[0]!.pushButtons[0]!.label = 'Reset';
  s.faderButtonGroups[0]!.label = 'Drums';
  s.faderButtonGroups[0]!.faders[0]!.label = 'Kick';
  s.faderButtonGroups[0]!.buttons[0]!.label = 'Mute';
  assert.deepEqual(check(file, JSON.parse(save(c))), []);
  assert.deepEqual(validate(c), []);
});

test('the schema uses only keywords the checker knows, so a misspelled keyword shows up', () => {
  const known = new Set(['$schema', '$ref', 'title', 'description', 'definitions', 'type', 'const', 'enum', 'minimum', 'maximum',
    'pattern', 'format', 'minItems', 'maxItems', 'items', 'required', 'properties', 'additionalProperties', 'if', 'then']);
  const walk = (node: unknown, inProperties: boolean): void => {
    if (Array.isArray(node)) { node.forEach((n) => { walk(n, false); }); return; }
    if (typeof node !== 'object' || node === null) return;
    for (const [k, v] of Object.entries(node)) {
      // inside `properties` and `definitions` the keys are names, not keywords
      if (!inProperties) assert.ok(known.has(k), `unknown schema keyword "${k}"`);
      walk(v, k === 'properties' || k === 'definitions');
    }
  };
  walk(file, false);
});

test('the schema is a JSON Schema draft-07 document with a title and described properties', () => {
  assert.equal(file.$schema, 'http://json-schema.org/draft-07/schema#');
  assert.ok(typeof file.title === 'string');
  const defs = file.definitions as Record<string, { properties: Record<string, { description?: string }> }>;
  for (const name of ['encoder', 'pushButton', 'greenButton', 'fader']) {
    for (const [k, p] of Object.entries(defs[name]!.properties)) assert.ok(p.description, `${name}.${k} has a description`);
  }
});
