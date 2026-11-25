import { describe, expect, it } from 'vitest';
import { isEmptyEntry } from '../../src/app/numberEntry.ts';

describe('isEmptyEntry', () => {
  it('is empty only when nothing was typed', () => {
    expect(isEmptyEntry('', false)).toBe(true);
    expect(isEmptyEntry('', true)).toBe(false); // "12e": the browser says '' but the text is bad
    expect(isEmptyEntry('5', false)).toBe(false);
  });
});
