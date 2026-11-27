// The Resolve plan (plan 0008 decision 35, step 17): reserved numbers, the well-known CCs, checking a typed After value, applying.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  WELL_KNOWN_CC, applyPlan, checkPlanValue, entriesOf, factorySetup, resolveWarning, setPlanAfter, wellKnownCc, warnings,
} from '../../src/model/index.ts';
import type { PlanEntry, Setup, Uc4Config } from '../../src/model/index.ts';

const cfgOf = (...setups: Setup[]): Uc4Config => ({
  format: 'uc4-config', schemaVersion: 1, device: { profile: 'faderfox-uc4' },
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', setups,
});
const E = (g: number, i: number) => `setups[0].encoderGroups[${g}].encoders[${i}]`;
const F = (g: number, i: number) => `setups[0].faderButtonGroups[${g}].faders[${i}]`;
const se01 = (): Uc4Config => { const s = factorySetup(1); s.id = 'a'; return cfgOf(s); };
const factoryWarning = (cfg: Uc4Config, i: number) => warnings(cfg)[i]!;

test('wellKnownCc names the well-known CCs and only those', () => {
  const known = [0, 1, 7, 10, 11, 32, 64, 65, 66, 67, 68, 69, 120, 121, 122, 123, 124, 125, 126, 127];
  assert.deepEqual(WELL_KNOWN_CC.map((e) => e.number), known);
  assert.equal(wellKnownCc(64), 'sustain');
  assert.equal(wellKnownCc(7), 'volume');
  assert.equal(wellKnownCc(1), 'modulation');
  assert.equal(wellKnownCc(70), undefined);
  assert.equal(wellKnownCc(-1), undefined);
  assert.equal(wellKnownCc(2.5), undefined);
});

test('suggestions skip the well-known CCs (the CCAh half is covered in resolve.test.ts)', () => {
  const s = factorySetup(1); s.id = 'a';
  const cfg = cfgOf(s);
  // factory SE01: EG4 Enc1 (CC 32) and FAd1 (CC 32); the first free number above 32 is 64, well-known up to 69
  assert.equal(resolveWarning(cfg, factoryWarning(cfg, 0), { factory: true }).choices[0]!.suggestion!.text, 'CC 70');
});

test('a planned number is reserved: the next row moves on', () => {
  const cfg = se01();
  const w0 = factoryWarning(cfg, 0), w1 = factoryWarning(cfg, 1);
  const first = resolveWarning(cfg, w0, { factory: true }).choices[0]!;
  assert.equal(first.suggestion!.text, 'CC 70');
  const plan = entriesOf(cfg, first);
  assert.deepEqual(plan, [{ path: E(3, 0), property: 'number', before: 32, after: 70 }]);
  const second = resolveWarning(cfg, w1, { factory: true, plan }).choices[0]!;
  assert.equal(second.suggestion!.text, 'CC 71');
  const third = resolveWarning(cfg, factoryWarning(cfg, 2), { factory: true, plan: [...plan, ...entriesOf(cfg, second)] }).choices[0]!;
  assert.equal(third.suggestion!.text, 'CC 113'); // factory SE01 uses 72–112 on ch 1
});

test('a planned change that frees a number: the number is free for the next suggestion', () => {
  const cfg = se01();
  const w0 = factoryWarning(cfg, 0); // Enc1 · EG4 (32); the search runs upwards from 32
  assert.equal(resolveWarning(cfg, w0, { factory: true }).choices[0]!.suggestion!.text, 'CC 70');
  // CC 33 is sent by Enc2 · EG4 and FAd2 only; the plan moves both away, so 33 is the first free number above 32
  const plan: PlanEntry[] = [
    { path: E(3, 1), property: 'number', before: 33, after: 90 },
    { path: F(0, 1), property: 'number', before: 33, after: 91 },
  ];
  assert.equal(resolveWarning(cfg, w0, { factory: true, plan }).choices[0]!.suggestion!.text, 'CC 33');
});

test('planned entries for other setups or stale paths do not break a suggestion', () => {
  const cfg = se01();
  const plan: PlanEntry[] = [{ path: 'setups[7].encoderGroups[0].encoders[0]', property: 'number', before: 1, after: 2 }, { path: 'nope', property: 'number', before: 1, after: 2 }];
  assert.equal(resolveWarning(cfg, factoryWarning(cfg, 0), { factory: true, plan }).choices[0]!.suggestion!.text, 'CC 70');
});

test('entriesOf lists each changed property with its value before; a channel change comes as an entry too', () => {
  const cfg = se01();
  const choice = { path: E(3, 0), name: 'Enc1 · EG4', short: 'Enc1', suggestion: { change: { channel: 2, number: 5 }, text: 'CC 5 on ch 2' } };
  assert.deepEqual(entriesOf(cfg, choice), [
    { path: E(3, 0), property: 'channel', before: 1, after: 2 },
    { path: E(3, 0), property: 'number', before: 32, after: 5 },
  ]);
  assert.deepEqual(entriesOf(cfg, { ...choice, suggestion: null }), []);
  assert.deepEqual(entriesOf(cfg, { ...choice, path: 'nope' }), []);
});

test('checkPlanValue: a free value is fine, a taken one names who it collides with', () => {
  const cfg = se01();
  const free = checkPlanValue(cfg, [], { path: E(3, 0), property: 'number', after: 70 });
  assert.deepEqual(free, { valid: true, collidesWith: [] });
  // 33 is what Enc2 · EG4 and FAd2 send; Enc1 · EG4 at 33 collides with FAd2 (same fader group is not needed: EG4 ↔ FG1 factory pairs)
  const taken = checkPlanValue(cfg, [], { path: E(3, 0), property: 'number', after: 33 });
  assert.equal(taken.valid, true);
  assert.ok(taken.collidesWith.some((c) => c.path === F(0, 1)));
  assert.ok(taken.collidesWith.every((c) => typeof c.name === 'string'));
});

test('checkPlanValue takes the rest of the plan into account', () => {
  const cfg = se01();
  const plan: PlanEntry[] = [{ path: E(3, 1), property: 'number', before: 33, after: 70 }];
  const c = checkPlanValue(cfg, plan, { path: E(3, 0), property: 'number', after: 70 });
  assert.ok(c.collidesWith.some((x) => x.path === E(3, 1)));
  // its own entry does not count against itself
  const own = checkPlanValue(cfg, plan, { path: E(3, 1), property: 'number', after: 70 });
  assert.deepEqual(own.collidesWith, []);
});

test('checkPlanValue: a value out of range or not a number is not valid, with the reason', () => {
  const cfg = se01();
  for (const after of [128, -1, 1.5, Number.NaN]) {
    const c = checkPlanValue(cfg, [], { path: E(3, 0), property: 'number', after });
    assert.equal(c.valid, false, String(after));
    assert.ok(c.reason);
    assert.deepEqual(c.collidesWith, []);
  }
  assert.equal(checkPlanValue(cfg, [], { path: E(3, 0), property: 'channel', after: 17 }).valid, false);
  assert.equal(checkPlanValue(cfg, [], { path: E(3, 0), property: 'channel', after: 16 }).valid, true);
  // a CCAh number is 0–31
  const s = factorySetup(1); s.id = 'a'; Object.assign(s.encoderGroups[0]!.encoders[0]!, { type: 'CCAh', number: 4 });
  assert.equal(checkPlanValue(cfgOf(s), [], { path: E(0, 0), property: 'number', after: 40 }).valid, false);
  assert.equal(checkPlanValue(cfgOf(s), [], { path: E(0, 0), property: 'number', after: 31 }).valid, true);
  assert.equal(checkPlanValue(cfg, [], { path: 'nope', property: 'number', after: 1 }).valid, false);
});

test('applyPlan: sets every entry, reports what changed, leaves the input alone', () => {
  const cfg = se01();
  const plan: PlanEntry[] = [
    { path: E(3, 0), property: 'number', before: 32, after: 70 },
    { path: F(0, 1), property: 'number', before: 33, after: 71 },
  ];
  const r = applyPlan(cfg, plan);
  assert.deepEqual(r.refused, []);
  assert.deepEqual(r.applied, plan);
  assert.equal(r.config.setups[0]!.encoderGroups[3]!.encoders[0]!.number, 70);
  assert.equal(r.config.setups[0]!.faderButtonGroups[0]!.faders[1]!.number, 71);
  assert.equal(cfg.setups[0]!.encoderGroups[3]!.encoders[0]!.number, 32);
  assert.notEqual(r.config, cfg);
});

test('applyPlan refuses a stale entry (the value is not what the plan saw) and applies the rest', () => {
  const cfg = se01();
  const plan: PlanEntry[] = [
    { path: E(3, 0), property: 'number', before: 99, after: 70 },
    { path: E(3, 1), property: 'number', before: 33, after: 71 },
    { path: 'setups[0].nope', property: 'number', before: 1, after: 2 },
  ];
  const r = applyPlan(cfg, plan);
  assert.deepEqual(r.applied, [plan[1]]);
  assert.deepEqual(r.refused.map((x) => x.entry), [plan[0], plan[2]]);
  assert.ok(r.refused.every((x) => x.reason.length > 0));
  assert.equal(r.config.setups[0]!.encoderGroups[3]!.encoders[0]!.number, 32);
  assert.equal(r.config.setups[0]!.encoderGroups[3]!.encoders[1]!.number, 71);
});

test('applyPlan refuses an entry that is out of range, and an entry for a property the control has no value for', () => {
  const cfg = se01();
  const r = applyPlan(cfg, [
    { path: E(3, 0), property: 'number', before: 32, after: 300 },
    { path: E(3, 1), property: 'upper', before: 0, after: 5 }, // CCAb has no upper
  ]);
  assert.equal(r.applied.length, 0);
  assert.equal(r.refused.length, 2);
  assert.equal(r.config, cfg);
});

test('applyPlan with nothing to apply returns the same config', () => {
  const cfg = se01();
  assert.equal(applyPlan(cfg, []).config, cfg);
});

// --- a one-end edit of a planned PrGC range moves the block (step 21) ---
const range = (): PlanEntry[] => [
  { path: E(0, 0), property: 'lower', before: 17, after: 20 },
  { path: E(0, 0), property: 'upper', before: 20, after: 23 },
];
const afters = (plan: readonly PlanEntry[]) => plan.map((e) => [e.property, e.after]);

test('setPlanAfter: editing one end of a planned range moves the block, same width', () => {
  assert.deepEqual(afters(setPlanAfter(range(), E(0, 0), 'lower', 40)), [['lower', 40], ['upper', 43]]);
  assert.deepEqual(afters(setPlanAfter(range(), E(0, 0), 'upper', 40)), [['lower', 37], ['upper', 40]]);
});

test('setPlanAfter: never reverses a range ("programs 20–17"), a reversed range stays reversed', () => {
  assert.deepEqual(afters(setPlanAfter(range(), E(0, 0), 'upper', 18)), [['lower', 15], ['upper', 18]]);
  const rev = range().map((e) => ({ ...e, after: e.property === 'lower' ? 23 : 20 }));
  assert.deepEqual(afters(setPlanAfter(rev, E(0, 0), 'lower', 50)), [['lower', 50], ['upper', 47]]);
});

test('setPlanAfter: the block stays inside 0–127', () => {
  assert.deepEqual(afters(setPlanAfter(range(), E(0, 0), 'lower', 126)), [['lower', 124], ['upper', 127]]);
  assert.deepEqual(afters(setPlanAfter(range(), E(0, 0), 'upper', 1)), [['lower', 0], ['upper', 3]]);
});

test('setPlanAfter: a single entry, another control or a property without a partner just changes that entry', () => {
  const plan: PlanEntry[] = [...range(), { path: E(0, 1), property: 'number', before: 1, after: 70 }, { path: E(0, 2), property: 'upper', before: 3, after: 9 }];
  assert.deepEqual(afters(setPlanAfter(plan, E(0, 1), 'number', 80).slice(2, 3)), [['number', 80]]);
  assert.equal(setPlanAfter(plan, E(0, 2), 'upper', 12)[3]!.after, 12);
  assert.deepEqual(afters(setPlanAfter(plan, E(0, 0), 'lower', 40).slice(0, 2)), [['lower', 40], ['upper', 43]]);
  assert.equal(setPlanAfter(plan, E(0, 0), 'lower', 40)[2]!.after, 70); // other controls untouched
  assert.equal(setPlanAfter(plan, 'nope', 'lower', 1), plan); // no such entry: the same plan
});

test('setPlanAfter: a value that is no number is set as typed (checkPlanValue says why not)', () => {
  assert.deepEqual(afters(setPlanAfter(range(), E(0, 0), 'lower', 2.5)), [['lower', 2.5], ['upper', 23]]);
});

test('checkPlanValue: a one-end edit of a planned range checks the moved block', () => {
  const s = factorySetup(1); s.id = 'a';
  Object.assign(s.encoderGroups[0]!.encoders[0]!, { type: 'PrGC', channel: 1, lower: 17, upper: 20 });
  Object.assign(s.encoderGroups[0]!.encoders[1]!, { type: 'PrGC', channel: 1, lower: 40, upper: 43 });
  const cfg = cfgOf(s);
  const plan: PlanEntry[] = [
    { path: E(0, 0), property: 'lower', before: 17, after: 20 },
    { path: E(0, 0), property: 'upper', before: 20, after: 23 },
  ];
  // lower 38 moves the block to 38–41: it meets the other range at 40–43
  const hit = checkPlanValue(cfg, plan, { path: E(0, 0), property: 'lower', after: 38 });
  assert.equal(hit.valid, true);
  assert.deepEqual(hit.collidesWith.map((c) => c.path), [E(0, 1)]);
  // lower 30 moves it to 30–33: free
  assert.deepEqual(checkPlanValue(cfg, plan, { path: E(0, 0), property: 'lower', after: 30 }).collidesWith, []);
});
