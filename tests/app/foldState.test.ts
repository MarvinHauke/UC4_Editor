import { describe, expect, it } from 'vitest';
import { loadOpen, parseOpen, saveOpen } from '../../src/app/foldState.ts';

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
