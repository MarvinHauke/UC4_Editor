import { describe, expect, it } from 'vitest';
import { LIST_WIDTH, LIST_WIDTH_KEY, clampWidth, loadWidth, parseWidth, saveWidth, widthForKey } from '../../src/app/listWidth.ts';

describe('list width', () => {
  it('keeps the width between min and max', () => {
    expect(clampWidth(10)).toBe(LIST_WIDTH.min);
    expect(clampWidth(9999)).toBe(LIST_WIDTH.max);
    expect(clampWidth(250.4)).toBe(250);
    expect(clampWidth(NaN)).toBe(LIST_WIDTH.default);
  });
  it('reads stored text, falling back to the default', () => {
    expect(parseWidth(null)).toBe(LIST_WIDTH.default);
    expect(parseWidth('')).toBe(LIST_WIDTH.default);
    expect(parseWidth('abc')).toBe(LIST_WIDTH.default);
    expect(parseWidth('300')).toBe(300);
    expect(parseWidth('5000')).toBe(LIST_WIDTH.max);
  });
  it('steps with the keys (← widens: the list is on the right) and stops at the ends', () => {
    expect(widthForKey(200, 'ArrowLeft', false)).toBe(216);
    expect(widthForKey(300, 'ArrowRight', true)).toBe(252);
    expect(widthForKey(LIST_WIDTH.max, 'ArrowLeft', false)).toBe(LIST_WIDTH.max);
    expect(widthForKey(LIST_WIDTH.min, 'ArrowRight', false)).toBe(LIST_WIDTH.min);
    expect(widthForKey(200, 'Home', false)).toBe(LIST_WIDTH.min);
    expect(widthForKey(200, 'End', false)).toBe(LIST_WIDTH.max);
    expect(widthForKey(200, 'a', false)).toBeNull();
  });
  it('remembers the width and survives blocked storage', () => {
    const m = new Map<string, string>();
    const ok = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
    saveWidth(300, ok);
    expect(m.get(LIST_WIDTH_KEY)).toBe('300');
    expect(loadWidth(ok)).toBe(300);
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(loadWidth(broken)).toBe(LIST_WIDTH.default);
    expect(() => { saveWidth(300, broken); }).not.toThrow();
    expect(loadWidth(null)).toBe(LIST_WIDTH.default);
  });
});
