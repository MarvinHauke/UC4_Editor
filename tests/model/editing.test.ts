// Editing rules through the schema module's public interface (plan 0002 step 4).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { changeType, factorySetup, nameProblems, normalizeGroupName, ENCODER_TYPES, PUSH_TYPES, GREEN_TYPES, FADER_TYPES } from '../../src/model/index.ts';

const s = factorySetup(3);
const encoder = { ...s.encoderGroups[0]!.encoders[0]!, lower: 10, upper: 90 };
const push = s.encoderGroups[0]!.pushButtons[0]!;
const green = s.faderButtonGroups[0]!.buttons[0]!;
const fader = s.faderButtonGroups[0]!.faders[0]!;

// --- changeType: every type of every kind, hidden values kept ---
const kinds = [
  ['encoder', encoder, ENCODER_TYPES],
  ['push button', push, PUSH_TYPES],
  ['green button', green, GREEN_TYPES],
  ['fader', fader, FADER_TYPES],
] as const;
for (const [kind, control, types] of kinds) {
  for (const type of types) {
    test(`a ${kind} changed to ${type} keeps every other property`, () => {
      const r = (changeType as unknown as (c: unknown, t: string) => { control: Record<string, unknown>; message?: string })(control, type);
      assert.deepEqual({ ...r.control, type: undefined }, { ...control, type: undefined });
      assert.equal(r.control.type, type);
      assert.equal(r.message, undefined);
    });
  }
}

test('changing a type does not touch the original control', () => {
  const before = JSON.stringify(encoder);
  changeType(encoder, 'CCr1');
  assert.equal(JSON.stringify(encoder), before);
});

test('lower and upper survive a trip through a relative type and back', () => {
  const there = changeType(encoder, 'CCr1').control;
  const back = changeType(there, 'CCAb').control;
  assert.deepEqual(back, encoder);
});

// --- CCAh ---
const high = [32, 100, 127];
for (const number of high) {
  test(`an encoder with number ${number} changed to CCAh gets 31 and a message`, () => {
    const r = changeType({ ...encoder, number }, 'CCAh');
    assert.equal(r.control.number, 31);
    assert.equal(r.control.type, 'CCAh');
    assert.match(r.message ?? '', new RegExp(`from ${number} to 31`));
  });
}
for (const number of [0, 31]) {
  test(`an encoder with number ${number} changed to CCAh is left as it is`, () => {
    const r = changeType({ ...encoder, number }, 'CCAh');
    assert.equal(r.control.number, number);
    assert.equal(r.message, undefined);
  });
}
test('switching back from CCAh does not restore the number', () => {
  const lowered = changeType({ ...encoder, number: 100 }, 'CCAh').control;
  assert.equal(changeType(lowered, 'CCAb').control.number, 31);
});

// --- group-name input ---
const input: [string, string, string, number][] = [
  // typed, name, text one hint contains, number of hints
  ['grp1', 'grp1', '', 0],
  ['GrP1', 'grp1', '', 0],
  ['viol', 'uiol', '', 0],
  ['VIOL', 'uiol', '', 0],
  ['kick', 'ic  ', 'k', 1],
  ['wow', 'o   ', 'w', 1],
  ['ab', 'ab  ', '', 0],
  ['', '    ', '', 0],
  ['-_\'"', '-_\'"', '', 0],
  ['abcdef', 'abcd', 'ef', 1],
  ['a#b', 'ab  ', '#', 1],
];
for (const [typed, name, hintText, hints] of input) {
  test(`typing "${typed}" gives the group name "${name}"`, () => {
    const r = normalizeGroupName(typed);
    assert.equal(r.name, name);
    assert.equal(r.hints.length, hints);
    if (hintText) assert.ok(r.hints.some((h) => h.includes(hintText)), r.hints.join('; '));
  });
}
test('k and w are refused with a hint that says what the device has', () => {
  assert.match(normalizeGroupName('k').hints[0]!, /no "k"/);
  assert.match(normalizeGroupName('w').hints[0]!, /no "w"/);
});

test('text is not padded while the name is, so a field can keep typing', () => {
  const r = normalizeGroupName('a');
  assert.equal(r.text, 'a');
  assert.equal(r.name, 'a   ');
  assert.equal(normalizeGroupName(r.text + 'b').text, 'ab');
  assert.equal(normalizeGroupName('abcdef').text, 'abcd');
});

test('whatever is typed, the resulting name is a valid group name', () => {
  for (const typed of ['', 'kick', 'GrP1', 'viol', '\t', '€€€€', 'a\u0301', 'ab cd', 'ÄÖÜ']) {
    assert.deepEqual(nameProblems(normalizeGroupName(typed).name), [], JSON.stringify(typed));
  }
});
