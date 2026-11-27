import { describe, expect, it } from 'vitest';
import { flashTargets, keepRefused, propertyName, pickedChoice, pickRow, planEntries, removeAt, setAfter, withoutRow, type PlanItem } from '../../src/app/resolvePlan.ts';

const e = (path: string, property: 'number' | 'channel' = 'number', after = 70) => ({ path, property, before: 36, after });
const item = (rowId: string, choice: number, path: string, after = 70): PlanItem => ({ rowId, choice, entry: e(path, 'number', after) });

describe('pickRow', () => {
  it('adds a row\'s pick and reports which choice is picked', () => {
    const p = pickRow([], 'r1', 0, [e('a')]);
    expect(pickedChoice(p, 'r1')).toBe(0);
    expect(pickedChoice(p, 'r2')).toBeNull();
    expect(planEntries(p)).toEqual([e('a')]);
  });
  it('replaces the row\'s earlier pick (the other control instead)', () => {
    const p = pickRow(pickRow([], 'r1', 0, [e('a')]), 'r1', 1, [e('b')]);
    expect(p.map((i) => i.entry.path)).toEqual(['b']);
    expect(pickedChoice(p, 'r1')).toBe(1);
  });
  it('picking the same choice again takes it back', () => {
    const p = pickRow(pickRow([], 'r1', 0, [e('a')]), 'r1', 0, [e('a')]);
    expect(p).toEqual([]);
  });
  it('lets a control be planned once: another row\'s entry for the same control and property goes', () => {
    const p = pickRow(pickRow([], 'r1', 0, [e('a')]), 'r2', 0, [e('a', 'number', 71)]);
    expect(p.map((i) => [i.rowId, i.entry.after])).toEqual([['r2', 71]]);
  });
});

describe('editing the plan', () => {
  const plan = [item('r1', 0, 'a'), item('r2', 0, 'b', 71)];
  it('removes one line', () => { expect(removeAt(plan, 0).map((i) => i.entry.path)).toEqual(['b']); });
  it('moves the other end of a planned PrGC range with the one edited, and keeps each line\'s row', () => {
    const path = 'setups[0].encoderGroups[0].encoders[0]';
    const range: PlanItem[] = [
      { rowId: 'r', choice: 0, entry: { path, property: 'lower', before: 0, after: 10 } },
      { rowId: 'r', choice: 0, entry: { path, property: 'upper', before: 127, after: 20 } },
    ];
    const next = setAfter(range, 0, 30);
    expect(next.map((i) => i.entry.after)).toEqual([30, 40]);
    expect(next.every((i) => i.rowId === 'r' && i.choice === 0)).toBe(true);
  });
  it('pins the clamp: 15 into Upper of a 20–30 range puts Lower at 5; 200 holds the block at the top', () => {
    const path = 'setups[0].encoderGroups[0].encoders[0]';
    const range: PlanItem[] = [
      { rowId: 'r', choice: 0, entry: { path, property: 'lower', before: 0, after: 20 } },
      { rowId: 'r', choice: 0, entry: { path, property: 'upper', before: 127, after: 30 } },
    ];
    expect(setAfter(range, 1, 15).map((i) => i.entry.after)).toEqual([5, 15]);
    expect(setAfter(range, 1, 1).map((i) => i.entry.after)).toEqual([0, 10]); // the typed "1" would clamp: the table waits for Enter
    expect(setAfter(range, 1, 200).map((i) => i.entry.after)).toEqual([117, 127]);
  });
  it('changes an After value', () => { expect(setAfter(plan, 1, 90)[1]!.entry.after).toBe(90); expect(plan[1]!.entry.after).toBe(71); });
  it('drops a row and lists the rest', () => { expect(withoutRow(plan, 'r1')).toEqual([plan[1]]); });
});

describe('flashTargets', () => {
  const sel = { setupId: 's1', encoderGroup: 3, faderButtonGroup: 0 };
  it('names only the controls of the open setup in the groups on show', () => {
    const changed = [
      { address: { setupId: 's1', area: 'encoders' as const, group: 3, index: 4 }, properties: ['number' as const] },
      { address: { setupId: 's1', area: 'faders' as const, group: 1, index: 2 }, properties: ['number' as const] },
      { address: { setupId: 's2', area: 'faders' as const, group: 0, index: 2 }, properties: ['number' as const] },
      { address: { setupId: 's1', area: 'buttons' as const, group: 0, index: 7 }, properties: ['number' as const] },
    ];
    expect(flashTargets(changed, sel)).toEqual(['control:encoders:4', 'control:buttons:7']);
  });
});


describe('keepRefused (decision 35)', () => {
  const plan = [item('r1', 0, 'a'), item('r2', 0, 'b', 71)];
  it('keeps only the entries Apply refused, with their reasons by line', () => {
    const left = keepRefused(plan, [{ entry: { ...plan[1]!.entry }, reason: 'stale' }]);
    expect(left.plan).toEqual([plan[1]]);
    expect(left.reasons.get('b|number')).toBe('stale');
  });
  it('keeps nothing when nothing was refused', () => { expect(keepRefused(plan, []).plan).toEqual([]); });
});

describe('propertyName', () => {
  it('uses the panel\'s own word for the control kind', () => {
    expect(propertyName('setups[0].faderButtonGroups[1].faders[8]', 'channel')).toBe('MIDI channel');
    expect(propertyName('setups[0].faderButtonGroups[1].faders[8]', 'upper')).toBe('Upper value');
    expect(propertyName('nonsense', 'number')).toBe('Number');
  });
});
