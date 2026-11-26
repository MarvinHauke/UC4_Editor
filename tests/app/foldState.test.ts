import { describe, expect, it } from 'vitest';
import { CONNECTIONS_KEY, loadOpen as loadColumn, saveOpen as saveColumn } from '../../src/app/connections.ts';
import { FOLD_KEY, loadOpen, parseOpen, saveOpen } from '../../src/app/foldState.ts';

const memory = () => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };

describe('folded sections', () => {
  it('are folded until opened, and remember each one', () => {
    const s = memory();
    expect(loadOpen('connection', s)).toBe(false);
    saveOpen('connection', true, s);
    saveOpen('dumps', true, s);
    expect(loadOpen('connection', s)).toBe(true);
    saveOpen('connection', false, s);
    expect(loadOpen('connection', s)).toBe(false);
    expect(loadOpen('dumps', s)).toBe(true);
  });
  it('survive blocked or damaged storage', () => {
    expect(loadOpen('x', blocked)).toBe(false);
    expect(() => { saveOpen('x', true, blocked); }).not.toThrow();
    expect(parseOpen('{"a":1}')).toEqual([]);
    expect(parseOpen('[1,"a"]')).toEqual(['a']);
  });
});

describe('a section that starts open', () => {
  it('uses its fallback until the user folds or opens it', () => {
    const s = memory();
    expect(loadOpen('monitor', s, true)).toBe(true);
    saveOpen('monitor', false, s);
    expect(loadOpen('monitor', s, true)).toBe(false);
    saveOpen('monitor', true, s);
    expect(loadOpen('monitor', s, false)).toBe(true);
    expect(loadOpen('monitor', blocked, true)).toBe(true);
  });
});

describe('the column and its folds share one storage', () => {
  it('keep their own keys: opening the column does not wipe a fold, folding does not close the column', () => {
    const s = memory();
    saveColumn(true, s);
    saveOpen('monitor', false, s);
    saveOpen('dumps', true, s);
    expect(loadColumn(s)).toBe(true);
    expect(loadOpen('monitor', s, true)).toBe(false);
    expect(loadOpen('dumps', s)).toBe(true);
    saveColumn(false, s);
    expect(loadOpen('dumps', s)).toBe(true);
    expect(loadColumn(s)).toBe(false);
  });
  it('use different keys, and an old fold array under the column key reads as closed', () => {
    expect(FOLD_KEY).not.toBe(CONNECTIONS_KEY);
    const s = memory();
    s.setItem(CONNECTIONS_KEY, '["monitor"]');
    expect(loadColumn(s)).toBe(false);
  });
  it('reads a stored open/closed under the folds key as no folds', () => {
    const s = memory();
    s.setItem(FOLD_KEY, 'open');
    expect(loadOpen('monitor', s, true)).toBe(true);
    expect(loadOpen('dumps', s)).toBe(false);
  });
});
