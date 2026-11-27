import { describe, expect, it } from 'vitest';
import { blocksOf, keepChannel, listEntries, otherName, showSelection } from '../../src/app/warningList.ts';
import type { ListedWarning } from '../../src/storage/index.ts';

const w = (setupId: string, a: string, b: string, state: ListedWarning['state'] = 'open'): ListedWarning =>
  ({ setupId, controls: [a, b], key: { kind: 'cc', channel: 1, number: 36 }, message: 'Enc5 · EG4 and FAd5 · FG1 both send CC 36 ch 1', signature: '', state });
const enc = 'setups[0].encoderGroups[3].encoders[4]';
const fad = 'setups[0].faderButtonGroups[0].faders[4]';
const base = { scope: 'this' as const, setupId: 'a', setupIndex: 0, control: null };

describe('listEntries', () => {
  const list = [w('a', enc, fad), w('a', 'x', 'y', 'ignored'), w('b', enc, fad), w('a', 'p', 'q', 'factory')];
  const problems = [{ path: 'setups[0].name', message: 'm' }, { path: 'setups[1].name', message: 'n' }];
  it('lists every state of this setup', () => {
    expect(listEntries(problems, list, base).warnings).toEqual([list[0], list[1], list[3]]);
    expect(listEntries(problems, list, base).problems.map((e) => e.index)).toEqual([0]);
  });
  it('lists every setup with scope all', () => {
    expect(listEntries(problems, list, { ...base, scope: 'all' }).warnings).toHaveLength(4);
    expect(listEntries(problems, list, { ...base, scope: 'all' }).problems).toHaveLength(2);
  });
  it('lists a problem that belongs to no setup in every scope', () => {
    const whole = [{ path: 'setups', message: 'z' }, ...problems];
    expect(listEntries(whole, list, base).problems.map((e) => e.index)).toEqual([0, 1]);
  });
  it('filters to one control', () => {
    expect(listEntries([], list, { ...base, control: 'x' }).warnings).toEqual([list[1]]);
  });
});

describe('blocksOf (decision 31)', () => {
  it('orders open, ignored, factory and keeps each list in order', () => {
    const list = [w('a', 'p', 'q', 'factory'), w('a', 'x', 'y', 'ignored'), w('a', enc, fad), w('a', 'm', 'n')];
    const b = blocksOf(list);
    expect(b.open).toEqual([list[2], list[3]]);
    expect(b.ignored).toEqual([list[1]]);
    expect(b.factory).toEqual([list[0]]);
  });
});

describe('otherName', () => {
  it('names the other control from the paths', () => {
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

describe('keepChannel', () => {
  it('joins "ch" and its number with a no-break space', () => {
    expect(keepChannel('both send CC 41 ch 1')).toBe('both send CC 41 ch\u00a01');
    expect(keepChannel('a ch 12, b ch 3')).toBe('a ch\u00a012, b ch\u00a03');
    expect(keepChannel('Enc1 and church')).toBe('Enc1 and church');
  });
});
