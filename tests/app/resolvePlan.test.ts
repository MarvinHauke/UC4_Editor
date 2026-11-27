import { describe, expect, it } from 'vitest';
import { flashTargets, pickedChoice, pickRow, planEntries, removeAt, setAfter, withoutRow, PROPERTY_WORD, type PlanItem } from '../../src/app/resolvePlan.ts';

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

describe('PROPERTY_WORD', () => { it('words the plan properties', () => { expect(PROPERTY_WORD.number).toBe('Number'); }); });
