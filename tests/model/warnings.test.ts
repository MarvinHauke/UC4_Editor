// Warnings through the public interface (plan 0008 step 5).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { factorySetup, validate, warnings } from '../../src/model/index.ts';
import type { Setup, Uc4Config } from '../../src/model/index.ts';

const cfgOf = (...setups: Setup[]): Uc4Config => ({
  format: 'uc4-config', schemaVersion: 1, device: { profile: 'faderfox-uc4' },
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', setups,
});
// A setup where every control is silent, so a test sets exactly the controls it is about.
function quiet(): Setup {
  const s = structuredClone(factorySetup(1));
  for (const g of s.encoderGroups) { g.encoders.forEach((c) => { c.type = 'CCr1'; c.channel = 16; c.number = 0; });
    g.pushButtons.forEach((c) => { c.type = 'OFF'; }); }
  for (const g of s.faderButtonGroups) { g.faders.forEach((c) => { c.type = 'Pbnd'; c.channel = 16; });
    g.buttons.forEach((c) => { c.type = 'PrGC'; c.channel = 15; }); }
  // distinct CC numbers for every encoder (channel 16) so nothing collides by default
  s.encoderGroups.forEach((g, gi) => g.encoders.forEach((c, i) => { c.number = gi * 8 + i; }));
  // faders and green buttons: distinct CC and note numbers on channel 14
  s.faderButtonGroups.forEach((g) => { g.faders.forEach((c, i) => { c.type = 'CCAb'; c.channel = 14; c.number = i; });
    g.buttons.forEach((c, i) => { c.type = 'notE'; c.channel = 14; c.number = i; }); });
  return s;
}
const base = () => { const s = quiet(); s.id = 'a'; s.slot = 3; return s; };
const w = (s: Setup) => warnings(cfgOf(s));

// The factory layout collides by design (docs/reference/uc4-device.md): EG4 encoders and FG1 faders both send CC 32–39.
test('factory SE01–SE16 give exactly the 8 EG4 ↔ FG1 warnings (CC 32–39)', () => {
  for (let slot = 1; slot <= 16; slot++) {
    const r = warnings(cfgOf(factorySetup(slot)));
    assert.deepEqual(r.map((x) => x.message), Array.from({ length: 8 }, (_, i) =>
      `Enc${i + 1} · EG4 and FAd${i + 1} · FG1 both send CC ${32 + i} ch ${slot}`), `slot ${slot}`);
    assert.deepEqual(r[0]!.controls, ['setups[0].encoderGroups[3].encoders[0]', 'setups[0].faderButtonGroups[0].faders[0]']);
  }
});

test('factory SE17 and SE18 give exactly two warnings each (EG5 push buttons ↔ FG7 buttons, notes 122/123 ch 14)', () => {
  for (const slot of [17, 18]) {
    assert.deepEqual(warnings(cfgOf(factorySetup(slot))).map((x) => x.message), [
      'Pbt3 · EG5 and btn2 · FG7 both send note 122 ch 14',
      'Pbt4 · EG5 and btn1 · FG7 both send note 123 ch 14',
    ], `slot ${slot}`);
  }
});

test('the quiet baseline has no warning', () => { assert.deepEqual(w(base()), []); });

test('two controls of one encoder group sending the same CC warn, naming setup, paths and sentence', () => {
  const s = base();
  s.encoderGroups[0]!.encoders[2]!.number = 10; s.encoderGroups[0]!.encoders[2]!.channel = 1;
  s.encoderGroups[0]!.encoders[5]!.type = 'CCAb'; s.encoderGroups[0]!.encoders[5]!.number = 10; s.encoderGroups[0]!.encoders[5]!.channel = 1;
  const r = w(s);
  assert.equal(r.length, 1);
  assert.equal(r[0]!.setupId, 'a');
  assert.equal(r[0]!.slot, 3);
  assert.deepEqual(r[0]!.controls, ['setups[0].encoderGroups[0].encoders[2]', 'setups[0].encoderGroups[0].encoders[5]']);
  assert.deepEqual(r[0]!.key, { kind: 'cc', channel: 1, number: 10 });
  assert.equal(r[0]!.message, 'Enc3 · EG1 and Enc6 · EG1 both send CC 10 ch 1');
});

test('an encoder and a fader in any groups of the two halves warn', () => {
  const s = base();
  s.encoderGroups[0]!.encoders[2]!.number = 10; s.encoderGroups[0]!.encoders[2]!.channel = 1;
  const f = s.faderButtonGroups[1]!.faders[4]!; f.number = 10; f.channel = 1;
  const r = w(s);
  assert.equal(r.length, 1);
  assert.equal(r[0]!.message, 'Enc3 · EG1 and FAd5 · FG2 both send CC 10 ch 1');
  assert.deepEqual(r[0]!.controls, ['setups[0].encoderGroups[0].encoders[2]', 'setups[0].faderButtonGroups[1].faders[4]']);
});

test('the same message in two groups of one half does not warn', () => {
  const s = base();
  for (const gi of [0, 1]) { const c = s.encoderGroups[gi]!.encoders[2]!; c.number = 99; c.channel = 1; }
  for (const gi of [2, 3]) { const c = s.faderButtonGroups[gi]!.faders[0]!; c.number = 99; c.channel = 2; }
  assert.deepEqual(w(s), []);
});

test('a push button CC collides with an encoder CC of the same group', () => {
  const s = base();
  s.encoderGroups[1]!.encoders[0]!.number = 50; s.encoderGroups[1]!.encoders[0]!.channel = 3;
  const p = s.encoderGroups[1]!.pushButtons[0]!; p.type = 'CC'; p.number = 50; p.channel = 3;
  assert.equal(w(s).length, 1);
});

test('OFF sends nothing', () => {
  const s = base();
  for (const g of [0, 1]) { const p = s.encoderGroups[g]!.pushButtons[0]!; p.type = 'OFF'; p.number = 7; p.channel = 1; }
  assert.deepEqual(w(s), []);
});

test('a note does not collide with a CC of the same number', () => {
  const s = base();
  s.encoderGroups[0]!.encoders[0]!.number = 60; s.encoderGroups[0]!.encoders[0]!.channel = 5;
  const b = s.faderButtonGroups[0]!.buttons[0]!; b.type = 'notE'; b.number = 60; b.channel = 5;
  assert.deepEqual(w(s), []);
});

test('a different channel does not collide', () => {
  const s = base();
  s.encoderGroups[0]!.encoders[0]!.number = 60; s.encoderGroups[0]!.encoders[0]!.channel = 5;
  const f = s.faderButtonGroups[0]!.faders[0]!; f.number = 60; f.channel = 6;
  assert.deepEqual(w(s), []);
});

test('CCAh n also sends n + 32 and collides with another control’s CC n + 32', () => {
  const s = base();
  const e = s.encoderGroups[0]!.encoders[0]!; e.type = 'CCAh'; e.number = 5; e.channel = 2;
  const f = s.faderButtonGroups[0]!.faders[0]!; f.type = 'CCAb'; f.number = 37; f.channel = 2;
  const r = w(s);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0]!.key, { kind: 'cc', channel: 2, number: 37 });
  assert.equal(r[0]!.message, 'Enc1 · EG1 and FAd1 · FG1 both send CC 37 ch 2');
});

test('two CCAh controls sharing both CCs give one warning, named by the lower CC', () => {
  const s = base();
  for (const i of [0, 1]) { const e = s.encoderGroups[0]!.encoders[i]!; e.type = 'CCAh'; e.number = 5; e.channel = 2; }
  const r = w(s);
  assert.equal(r.length, 1);
  assert.equal(r[0]!.key.number, 5);
});

test('Pbnd and AFtt collide by channel only; PrGC ranges overlap (default 0–127), whatever the number', () => {
  const s = base();
  const e = s.encoderGroups[0]!.encoders; const f = s.faderButtonGroups[0]!.faders;
  e[0]!.type = 'Pbnd'; e[0]!.channel = 7; e[0]!.number = 1; f[0]!.type = 'Pbnd'; f[0]!.channel = 7; f[0]!.number = 99;
  e[1]!.type = 'AFtt'; e[1]!.channel = 8; e[1]!.number = 3; f[1]!.type = 'AFtt'; f[1]!.channel = 8; f[1]!.number = 4;
  e[2]!.type = 'PrGC'; e[2]!.channel = 9; e[2]!.number = 3; s.faderButtonGroups[3]!.faders[0]!.type = 'PrGC';
  s.faderButtonGroups[3]!.faders[0]!.channel = 9; s.faderButtonGroups[3]!.faders[0]!.number = 100;
  e[3]!.type = 'Pbnd'; e[3]!.channel = 10; f[3]!.type = 'Pbnd'; f[3]!.channel = 11;
  const r = w(s);
  assert.deepEqual(r.map((x) => x.key), [
    { kind: 'pitchBend', channel: 7 }, { kind: 'aftertouch', channel: 8 }, { kind: 'program', channel: 9, number: 0 },
  ]);
  assert.equal(r[0]!.message, 'Enc1 · EG1 and FAd1 · FG1 both send pitch bend ch 7');
});

test('only the same setup collides', () => {
  const a = base(); a.id = 'a'; a.encoderGroups[0]!.encoders[0]!.number = 60; a.encoderGroups[0]!.encoders[0]!.channel = 5;
  const b = base(); b.id = 'b'; b.slot = 4; const f = b.faderButtonGroups[0]!.faders[0]!; f.number = 60; f.channel = 5;
  assert.deepEqual(warnings(cfgOf(a, b)), []);
});

test('a warning in the second setup uses that setup’s paths and id', () => {
  const a = base();
  const b = base(); b.id = 'b'; delete b.slot;
  b.encoderGroups[0]!.encoders[0]!.number = 60; b.encoderGroups[0]!.encoders[0]!.channel = 5;
  b.faderButtonGroups[0]!.faders[0]!.number = 60; b.faderButtonGroups[0]!.faders[0]!.channel = 5;
  const r = warnings(cfgOf(a, b));
  assert.equal(r.length, 1);
  assert.equal(r[0]!.setupId, 'b');
  assert.equal(r[0]!.slot, undefined);
  assert.ok(r[0]!.controls[0].startsWith('setups[1]'));
});

test('validate stays problems-only: warnings do not appear in it', () => {
  const s = base();
  s.encoderGroups[0]!.encoders[0]!.number = 60; s.faderButtonGroups[0]!.faders[0]!.number = 60;
  s.encoderGroups[0]!.encoders[0]!.channel = 5; s.faderButtonGroups[0]!.faders[0]!.channel = 5;
  assert.equal(w(s).length, 1);
  assert.deepEqual(validate(cfgOf(s)), []);
});

test('validation accepts every number 0–127 for PrGC, AFtt and Pbnd', () => {
  const s = base();
  for (let n = 0; n <= 127; n++) {
    s.encoderGroups[0]!.encoders[0]!.type = 'PrGC'; s.encoderGroups[0]!.encoders[0]!.number = n;
    s.encoderGroups[0]!.encoders[1]!.type = 'AFtt'; s.encoderGroups[0]!.encoders[1]!.number = n;
    s.encoderGroups[0]!.encoders[2]!.type = 'Pbnd'; s.encoderGroups[0]!.encoders[2]!.number = n;
    s.faderButtonGroups[0]!.faders[0]!.type = 'Pbnd'; s.faderButtonGroups[0]!.faders[0]!.number = n;
    assert.deepEqual(validate(cfgOf(s)), [], `number ${n}`);
  }
});

test('warnings never throw on a loosely shaped configuration', () => {
  assert.deepEqual(warnings({ setups: [{ id: 'x' }] } as unknown as Uc4Config), []);
  assert.deepEqual(warnings({} as Uc4Config), []);
});

test('two PrGC scene buttons on one channel collide only on the same program (upper value)', () => {
  const mk = (u1: number, u2: number) => {
    const s = base();
    const p = s.encoderGroups[0]!.pushButtons; 
    for (const [i, u] of [[0, u1], [1, u2]] as const) { p[i]!.type = 'PrGC'; p[i]!.channel = 1; p[i]!.upper = u; }
    return w(s);
  };
  assert.deepEqual(mk(3, 5), []);
  const r = mk(4, 4);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0]!.key, { kind: 'program', channel: 1, number: 4 });
  assert.equal(r[0]!.message, 'Pbt1 · EG1 and Pbt2 · EG1 both send program 4 ch 1');
});

test('a PrGC button collides with an encoder PrGC range that contains its program, not outside it', () => {
  const mk = (upper: number) => {
    const s = base();
    const p = s.encoderGroups[0]!.pushButtons[0]!; p.type = 'PrGC'; p.channel = 1; p.upper = upper;
    const e = s.faderButtonGroups[0]!.faders[0]!; e.type = 'PrGC'; e.channel = 1; e.lower = 0; e.upper = 20;
    return w(s);
  };
  assert.equal(mk(10).length, 1);
  assert.deepEqual(mk(10)[0]!.key, { kind: 'program', channel: 1, number: 10 });
  assert.deepEqual(mk(21), []);
});

test('different channels do not collide on a PrGC program', () => {
  const s = base();
  const a = s.encoderGroups[0]!.pushButtons[0]!; a.type = 'PrGC'; a.channel = 1; a.upper = 3;
  const b = s.encoderGroups[0]!.pushButtons[1]!; b.type = 'PrGC'; b.channel = 2; b.upper = 3;
  assert.deepEqual(w(s), []);
});
