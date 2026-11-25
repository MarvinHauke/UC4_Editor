import { describe, expect, it } from 'vitest';
import { problemKey, relocate } from '../../src/app/problemCursor.ts';

const p = (n: number) => ({ path: `setups[0].x${n}`, message: `m${n}` });
const list = (...ns: number[]) => ns.map(p);

describe('relocate', () => {
  it('follows the same problem when others before it are fixed', () => {
    expect(relocate(list(2, 3, 4), 2, problemKey(p(3)))).toBe(1);
  });
  it('steps back when the current problem was fixed, so the next one is up next', () => {
    // at "3 of 5" (index 2), fixed: the list was 0 1 2 3 4, now 0 1 3 4
    expect(relocate(list(0, 1, 3, 4), 2, problemKey(p(2)))).toBe(1);
  });
  it('goes to before-the-start when the first one was fixed', () => {
    expect(relocate(list(1, 2), 0, problemKey(p(0)))).toBe(-1);
  });
  it('resets on an empty list and when not started', () => {
    expect(relocate([], 2, problemKey(p(1)))).toBe(-1);
    expect(relocate(list(1), -1, null)).toBe(-1);
  });
  it('never points past the end', () => {
    expect(relocate(list(0), 5, problemKey(p(9)))).toBe(0);
  });
});
