import { describe, expect, it } from 'vitest';
import { controlNames, hiddenCount, listEntries, otherName, showSelection } from '../../src/app/warningList.ts';
import type { ListedWarning } from '../../src/storage/index.ts';

const w = (setupId: string, a: string, b: string, state: ListedWarning['state'] = 'open'): ListedWarning =>
  ({ setupId, controls: [a, b], key: { kind: 'cc', channel: 1, number: 36 }, message: 'Enc5 · EG4 and FAd5 · FG1 both send CC 36 ch 1', state });
const enc = 'setups[0].encoderGroups[3].encoders[4]';
const fad = 'setups[0].faderButtonGroups[0].faders[4]';
const base = { scope: 'this' as const, showWaived: false, setupId: 'a', setupIndex: 0, control: null };

describe('listEntries', () => {
  const list = [w('a', enc, fad), w('a', 'x', 'y', 'waived'), w('b', enc, fad), w('a', 'p', 'q', 'factory')];
  const problems = [{ path: 'setups[0].name', message: 'm' }, { path: 'setups[1].name', message: 'n' }];
  it('lists open warnings of this setup by default', () => {
    expect(listEntries(problems, list, base).warnings).toEqual([list[0]]);
    expect(listEntries(problems, list, base).problems.map((e) => e.index)).toEqual([0]);
  });
  it('lists every setup with scope all, and waived and factory with showWaived', () => {
    expect(listEntries(problems, list, { ...base, scope: 'all' }).warnings).toHaveLength(2);
    expect(listEntries(problems, list, { ...base, scope: 'all' }).problems).toHaveLength(2);
    expect(listEntries(problems, list, { ...base, showWaived: true }).warnings).toHaveLength(3);
  });
  it('filters to one control', () => {
    expect(listEntries([], list, { ...base, showWaived: true, control: 'x' }).warnings).toEqual([list[1]]);
  });
  it('counts what the filter hides', () => {
    expect(hiddenCount(list, base)).toBe(2);
    expect(hiddenCount(list, { ...base, scope: 'all' })).toBe(2);
  });
});

describe('names', () => {
  it('reads the two names of the message, in order', () => {
    expect(controlNames(w('a', enc, fad))).toEqual(['Enc5 · EG4', 'FAd5 · FG1']);
    expect(otherName(w('a', enc, fad), enc)).toBe('FAd5 · FG1');
    expect(otherName(w('a', enc, fad), fad)).toBe('Enc5 · EG4');
  });
});

describe('showSelection', () => {
  it('selects the setup, both groups and the first control', () => {
    expect(showSelection(w('a', enc, fad))).toEqual({ setupId: 'a', encoderGroup: 3, faderButtonGroup: 0, control: { area: 'encoders', index: 4 } });
  });
  it('selects the other control when asked', () => {
    expect(showSelection(w('a', enc, fad), fad).control).toEqual({ area: 'faders', index: 4 });
  });
});
