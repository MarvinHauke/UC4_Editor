// Resolve suggestions (plan 0008 decision 32, step 14): which control to change and to what value.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { factorySetup, resolveProblem, resolveWarning, validate, warnings } from '../../src/model/index.ts';
import type { Setup, Uc4Config, Warning } from '../../src/model/index.ts';

const cfgOf = (...setups: Setup[]): Uc4Config => ({
  format: 'uc4-config', schemaVersion: 1, device: { profile: 'faderfox-uc4' },
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', setups,
});
const E = (g: number, i: number) => `setups[0].encoderGroups[${g}].encoders[${i}]`;
const P = (g: number, i: number) => `setups[0].encoderGroups[${g}].pushButtons[${i}]`;
const F = (g: number, i: number) => `setups[0].faderButtonGroups[${g}].faders[${i}]`;
const B = (g: number, i: number) => `setups[0].faderButtonGroups[${g}].buttons[${i}]`;
const warn = (setup: Setup, a: string, b: string): Warning => ({
  setupId: setup.id, controls: [a, b], key: { kind: 'cc', channel: 1, number: 0 }, signature: 's', message: 'm',
});

// A setup that sends nothing the tests care about: encoders and faders send pitch bend on ch 16, push buttons are OFF,
// green buttons send channel aftertouch on ch 16. A test then sets the controls it is about.
function silent(): Setup {
  const s = structuredClone(factorySetup(1));
  s.id = 'a'; s.slot = 3;
  for (const g of s.encoderGroups) {
    g.encoders.forEach((c) => { c.type = 'Pbnd'; c.channel = 16; });
    g.pushButtons.forEach((c) => { c.type = 'OFF'; });
  }
  for (const g of s.faderButtonGroups) {
    g.faders.forEach((c) => { c.type = 'Pbnd'; c.channel = 16; });
    g.buttons.forEach((c) => { c.type = 'AFtt'; c.channel = 16; });
  }
  return s;
}
const enc = (s: Setup, g: number, i: number) => s.encoderGroups[g]!.encoders[i]!;
const fad = (s: Setup, g: number, i: number) => s.faderButtonGroups[g]!.faders[i]!;
const cc = (c: { type: string; channel: number; number: number }, channel: number, number: number, type = 'CCAb') => {
  Object.assign(c, { type, channel, number });
};

// --- the value ---
test('a CC collision suggests the next free number upwards on the same channel and type (all groups)', () => {
  const s = silent();
  cc(enc(s, 0, 0), 1, 10); cc(fad(s, 0, 0), 1, 10); // the collision
  cc(enc(s, 5, 2), 1, 11); cc(fad(s, 3, 4), 1, 12); // taken in other groups
  const r = resolveWarning(cfgOf(s), warn(s, E(0, 0), F(0, 0)));
  assert.equal(r.choices[0]!.path, F(0, 0)); // both not factory → the second-named
  assert.deepEqual(r.choices[0]!.suggestion, { change: { number: 13 }, text: 'CC 13' });
  assert.equal(r.choices[1]!.path, E(0, 0));
  assert.deepEqual(r.choices[1]!.suggestion, { change: { number: 13 }, text: 'CC 13' });
  assert.equal(r.sideBySide, false);
});

test('the number wraps at 127', () => {
  const s = silent();
  cc(enc(s, 0, 0), 1, 126); cc(fad(s, 0, 0), 1, 126); cc(enc(s, 0, 1), 1, 127);
  const r = resolveWarning(cfgOf(s), warn(s, E(0, 0), F(0, 0)));
  assert.deepEqual(r.choices[0]!.suggestion, { change: { number: 0 }, text: 'CC 0' });
});

test('a CC of another channel or a note of the same number does not count as taken', () => {
  const s = silent();
  cc(enc(s, 0, 0), 1, 10); cc(fad(s, 0, 0), 1, 10);
  cc(enc(s, 0, 1), 2, 11); cc(enc(s, 0, 2), 1, 11, 'CCr1'); // 11 on ch 1 taken by the CCr1 only
  s.encoderGroups[0]!.pushButtons[0]!.type = 'notE'; Object.assign(s.encoderGroups[0]!.pushButtons[0]!, { channel: 1, number: 12 });
  const r = resolveWarning(cfgOf(s), warn(s, E(0, 0), F(0, 0)));
  assert.equal(r.choices[0]!.suggestion!.text, 'CC 12'); // 11 is taken (CCr1 ch 1); the note 12 is not a CC
});

test('a channel with no room: the same number on the next channel up (16 → 1), the name says both', () => {
  // PrGC blocks make "no room" reachable: a 128-wide range has one place per channel.
  const s = silent();
  const e = enc(s, 0, 0); Object.assign(e, { type: 'PrGC', channel: 16, lower: 0, upper: 127 });
  const f = fad(s, 0, 0); Object.assign(f, { type: 'PrGC', channel: 16, lower: 0, upper: 127 });
  const r = resolveWarning(cfgOf(s), warn(s, E(0, 0), F(0, 0)));
  assert.deepEqual(r.choices[0]!.suggestion, { change: { channel: 1, lower: 0, upper: 127 }, text: 'programs 0–127 on ch 1' });
});

test('the channel step skips a channel where the number is taken and finds the next free one there', () => {
  const s = silent();
  const e = enc(s, 0, 0); Object.assign(e, { type: 'PrGC', channel: 1, lower: 0, upper: 1 });
  const f = fad(s, 0, 0); Object.assign(f, { type: 'PrGC', channel: 1, lower: 0, upper: 1 });
  // programs 2–127 taken on ch 1 by two more controls, so ch 1 has no room for a block of 2 apart from its own place
  Object.assign(enc(s, 0, 1), { type: 'PrGC', channel: 1, lower: 2, upper: 127 });
  // on ch 2, program 0 is taken, so the first free block of 2 there starts at 1
  Object.assign(enc(s, 0, 2), { type: 'PrGC', channel: 2, lower: 0, upper: 0 });
  const r = resolveWarning(cfgOf(s), warn(s, E(0, 0), F(0, 0)));
  assert.deepEqual(r.choices[0]!.suggestion, { change: { channel: 2, lower: 1, upper: 2 }, text: 'programs 1–2 on ch 2' });
});

test('nothing free anywhere: no suggestion, with the reason', () => {
  const s = silent();
  Object.assign(enc(s, 0, 0), { type: 'PrGC', channel: 1, lower: 0, upper: 127 });
  Object.assign(fad(s, 0, 0), { type: 'PrGC', channel: 1, lower: 0, upper: 127 });
  // program 0 is taken on every channel 2–16 by a push button (channel 1 by the collision partner)
  for (let ch = 2; ch <= 16; ch++) {
    const b = s.faderButtonGroups[Math.floor((ch - 2) / 8)]!.buttons[(ch - 2) % 8]!;
    Object.assign(b, { type: 'PrGC', channel: ch, upper: 0 });
  }
  const r = resolveWarning(cfgOf(s), warn(s, E(0, 0), F(0, 0)));
  assert.equal(r.choices[0]!.suggestion, null);
  assert.equal(r.choices[0]!.reason, 'No free block of 128 programs');
});

test('CCAh needs n and n + 32 free, numbers 0–31', () => {
  const s = silent();
  Object.assign(enc(s, 0, 0), { type: 'CCAh', channel: 1, number: 5 });
  cc(fad(s, 0, 0), 1, 5); // collides on 5
  cc(enc(s, 0, 1), 1, 6 + 32); // 6 is free but its LSB 38 is taken
  cc(enc(s, 0, 2), 1, 7); // 7 taken
  const r = resolveWarning(cfgOf(s), warn(s, E(0, 0), F(0, 0)));
  // the fader (second) moves as a plain CC: next free above 5 is 6
  assert.deepEqual(r.choices[0]!.suggestion, { change: { number: 6 }, text: 'CC 6' });
  // the CCAh encoder moves to 8 (6: 38 is taken; 7 is taken)
  assert.deepEqual(r.choices[1]!.suggestion, { change: { number: 8 }, text: 'CC 8' });
});

test('CCAh wraps at 31, not 127', () => {
  const s = silent();
  Object.assign(enc(s, 0, 0), { type: 'CCAh', channel: 1, number: 31 });
  cc(fad(s, 0, 0), 1, 31);
  const r = resolveWarning(cfgOf(s), warn(s, E(0, 0), F(0, 0)));
  assert.deepEqual(r.choices[1]!.suggestion, { change: { number: 0 }, text: 'CC 0' });
});

test('a PrGC range moves as a block of the same width, direction kept', () => {
  const s = silent();
  Object.assign(enc(s, 0, 0), { type: 'PrGC', channel: 1, lower: 10, upper: 12 });
  Object.assign(fad(s, 0, 0), { type: 'PrGC', channel: 1, lower: 12, upper: 12 });
  Object.assign(enc(s, 0, 1), { type: 'PrGC', channel: 1, lower: 14, upper: 14 });
  const r = resolveWarning(cfgOf(s), warn(s, E(0, 0), F(0, 0)));
  assert.deepEqual(r.choices[1]!.suggestion, { change: { lower: 15, upper: 17 }, text: 'programs 15–17' });
  Object.assign(enc(s, 0, 0), { lower: 12, upper: 10 }); // reversed
  const r2 = resolveWarning(cfgOf(s), warn(s, E(0, 0), F(0, 0)));
  assert.deepEqual(r2.choices[1]!.suggestion, { change: { lower: 17, upper: 15 }, text: 'programs 15–17' });
});

test('a PrGC push button sends its upper value: the suggestion changes upper', () => {
  const s = silent();
  Object.assign(s.encoderGroups[0]!.pushButtons[0]!, { type: 'PrGC', channel: 1, upper: 20 });
  Object.assign(fad(s, 0, 0), { type: 'PrGC', channel: 1, lower: 20, upper: 21 });
  const r = resolveWarning(cfgOf(s), warn(s, P(0, 0), F(0, 0)));
  assert.deepEqual(r.choices[1]!.suggestion, { change: { upper: 22 }, text: 'program 22' }); // 20 and 21 are the fader's
  assert.equal(r.choices[1]!.path, P(0, 0));
});

test('a PrGC push button with lower = upper ("one program number") keeps them equal', () => {
  const s = silent();
  Object.assign(s.encoderGroups[0]!.pushButtons[0]!, { type: 'PrGC', channel: 1, lower: 20, upper: 20 });
  Object.assign(fad(s, 0, 0), { type: 'PrGC', channel: 1, lower: 20, upper: 21 });
  const r = resolveWarning(cfgOf(s), warn(s, P(0, 0), F(0, 0)));
  assert.deepEqual(r.choices[1]!.suggestion!.change, { lower: 22, upper: 22 });
});

test('a note collision suggests a free note', () => {
  const s = silent();
  Object.assign(s.encoderGroups[0]!.pushButtons[0]!, { type: 'notE', channel: 1, number: 5 });
  Object.assign(s.faderButtonGroups[0]!.buttons[0]!, { type: 'notE', channel: 1, number: 5 });
  const r = resolveWarning(cfgOf(s), warn(s, P(0, 0), B(0, 0)));
  assert.equal(r.choices[0]!.path, B(0, 0));
  assert.deepEqual(r.choices[0]!.suggestion, { change: { number: 6 }, text: 'note 6' });
});

test('pitch bend and aftertouch collide by channel: the suggestion is the next channel up where none sends it', () => {
  const s = silent();
  Object.assign(enc(s, 0, 0), { type: 'Pbnd', channel: 16 });
  Object.assign(fad(s, 0, 0), { type: 'Pbnd', channel: 16 });
  Object.assign(enc(s, 0, 1), { type: 'Pbnd', channel: 1 });
  const r = resolveWarning(cfgOf(s), warn(s, E(0, 0), F(0, 0)));
  assert.deepEqual(r.choices[0]!.suggestion, { change: { channel: 2 }, text: 'ch 2' }); // 16 → 1 taken → 2
});

test('a control that sends nothing has no suggestion', () => {
  const s = silent();
  const r = resolveWarning(cfgOf(s), warn(s, P(0, 0), P(0, 1)));
  assert.equal(r.choices[0]!.suggestion, null);
  assert.ok(r.choices[0]!.reason);
});

// --- which control ---
test('the control that differs from factory is the one to change, with "instead" the other', () => {
  const s = factorySetup(1); s.id = 'a';
  s.encoderGroups[0]!.encoders[0]!.number = 40; // collides with FAd1 · FG2 (factory 40)
  const [w] = warnings(cfgOf(s)).filter((x) => x.controls.includes(E(0, 0)));
  assert.ok(w);
  const r = resolveWarning(cfgOf(s), w!);
  assert.equal(r.choices[0]!.path, E(0, 0));
  assert.equal(r.choices[0]!.name, 'Enc1 · EG1');
  assert.equal(r.choices[0]!.short, 'Enc1');
  assert.equal(r.choices[0]!.suggestion!.text, 'CC 64');
  assert.equal(r.choices[1]!.path, F(1, 0));
  assert.equal(r.choices[1]!.short, 'FAd1');
});

test('the other control being the one that differs picks that one, whatever the order', () => {
  const s = factorySetup(1); s.id = 'a';
  s.faderButtonGroups[0]!.faders[7]!.number = 8; // collides with Enc1 · EG1 (factory 8)
  const [w] = warnings(cfgOf(s)).filter((x) => x.controls.includes(F(0, 7)));
  const r = resolveWarning(cfgOf(s), w!);
  assert.equal(r.choices[0]!.path, F(0, 7));
  assert.equal(r.choices[1]!.path, E(0, 0));
});

test('both differ from factory: the second-named; label alone does not count as a difference', () => {
  const s = factorySetup(1); s.id = 'a';
  s.encoderGroups[0]!.encoders[0]!.number = 40;
  s.faderButtonGroups[1]!.faders[0]!.number = 40; // factory is 40 already; change something else instead
  s.faderButtonGroups[1]!.faders[0]!.channel = 1; // same as factory
  s.faderButtonGroups[1]!.faders[0]!.label = 'Vol';
  const [w] = warnings(cfgOf(s)).filter((x) => x.controls.includes(E(0, 0)));
  assert.equal(resolveWarning(cfgOf(s), w!).choices[0]!.path, E(0, 0)); // the label does not make the fader "changed"
  s.faderButtonGroups[1]!.faders[0]!.mode = 'SnAP';
  assert.equal(resolveWarning(cfgOf(s), w!).choices[0]!.path, F(1, 0)); // both differ → second
});

test('a setup without a slot has no factory to compare: second-named', () => {
  const s = silent(); delete s.slot;
  cc(enc(s, 0, 0), 1, 10); cc(fad(s, 0, 0), 1, 10);
  assert.equal(resolveWarning(cfgOf(s), warn(s, E(0, 0), F(0, 0))).choices[0]!.path, F(0, 0));
});

test('factory collisions SE01: both sides suggested side by side, every EG4 / FG1 pair', () => {
  const s = factorySetup(1);
  const cfg = cfgOf(s);
  const list = warnings(cfg);
  assert.equal(list.length, 8);
  const taken = new Set<string>();
  list.forEach((w, i) => {
    const r = resolveWarning(cfg, w, { factory: true });
    assert.equal(r.sideBySide, true);
    assert.equal(r.choices.length, 2);
    assert.deepEqual(r.choices.map((c) => c.path), [E(3, i), F(0, i)]);
    // free CCs on ch 1 in factory SE01: 0–7, 64–71, 113–127. Above 32 + i the first free is 64.
    assert.equal(r.choices[0]!.suggestion!.text, 'CC 64');
    assert.equal(r.choices[1]!.suggestion!.text, 'CC 64');
    taken.add(r.choices[0]!.suggestion!.text);
  });
  assert.equal(taken.size, 1);
});

test('a stale warning (path or setup not there) gives no choices, never throws', () => {
  const s = silent();
  assert.deepEqual(resolveWarning(cfgOf(s), { ...warn(s, E(0, 0), F(0, 0)), setupId: 'zzz' }).choices, []);
  assert.deepEqual(resolveWarning(cfgOf(s), warn(s, 'setups[0].encoderGroups[9].encoders[0]', F(0, 0))).choices, []);
});

// --- problems ---
function problemOf(config: Uc4Config, path: string) {
  const p = validate(config).find((x) => x.path === path);
  assert.ok(p, `no problem at ${path}`);
  return p!;
}
test('a problem: the nearest valid value', () => {
  const s = silent();
  const bad = (path: string, _v: unknown, expected: unknown, c: Record<string, unknown>) => {
    const t = structuredClone(s); Object.assign(enc(t, 0, 0), c);
    const cfg = cfgOf(t);
    const r = resolveProblem(cfg, problemOf(cfg, path));
    assert.deepEqual(r.choices[0]!.suggestion!.change, expected);
  };
  bad(`${E(0, 0)}.upper`, 200, { upper: 127 }, { upper: 200 });
  bad(`${E(0, 0)}.lower`, -3, { lower: 0 }, { lower: -3 });
  bad(`${E(0, 0)}.channel`, 0, { channel: 1 }, { channel: 0 });
  bad(`${E(0, 0)}.channel`, 17, { channel: 16 }, { channel: 17 });
  bad(`${E(0, 0)}.number`, 2.6, { number: 3 }, { number: 2.6 });
  bad(`${E(0, 0)}.number`, 40, { number: 31 }, { type: 'CCAh', number: 40 }); // CCAh: 0–31
});

test('a problem with no number to be near (text, an unknown field, a bad type) has no suggestion', () => {
  const s = silent();
  Object.assign(enc(s, 0, 0), { upper: 'x' });
  const cfg = cfgOf(s);
  const r = resolveProblem(cfg, problemOf(cfg, `${E(0, 0)}.upper`));
  assert.equal(r.choices[0]!.suggestion, null);
  assert.ok(r.choices[0]!.reason);
  assert.deepEqual(resolveProblem(cfg, { path: 'format', message: 'x' }).choices, []);
  // a bad type or an unknown field: one choice with a reason, not an empty list (that means stale)
  Object.assign(enc(s, 0, 1), { type: 'zzz' });
  const cfg2 = cfgOf(s);
  const t = resolveProblem(cfg2, problemOf(cfg2, `${E(0, 1)}.type`));
  assert.equal(t.choices.length, 1);
  assert.equal(t.choices[0]!.suggestion, null);
});
