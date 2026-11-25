import { describe, expect, it } from 'vitest';
import { resetAllTexts } from '../../src/app/resetTexts.ts';

describe('reset all texts', () => {
  it('asks the decided question and names the last export', () => {
    const t = resetAllTexts('2026-11-14 15:39');
    expect(t.title).toBe('Reset all 18 setups to factory?');
    expect(t.body.join(' ')).toContain('Your changes are lost unless exported (last export: 2026-11-14 15:39)');
    expect(t.confirmLabel).toBe('Reset all');
  });
  it('says never when nothing was exported', () => {
    expect(resetAllTexts('never').body[0]).toContain('last export: never');
  });
});
