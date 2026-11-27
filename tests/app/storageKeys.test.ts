import { describe, expect, it } from 'vitest';
import { ALL_STORAGE_KEYS } from '../../src/app/storageKeys.ts';

describe('storage keys', () => {
  it('are unique and all start with uc4-editor-', () => {
    expect(new Set(ALL_STORAGE_KEYS).size).toBe(ALL_STORAGE_KEYS.length);
    for (const k of ALL_STORAGE_KEYS) expect(k).toMatch(/^uc4-editor-/);
  });
});
