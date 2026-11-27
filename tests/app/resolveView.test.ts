import { describe, expect, it } from 'vitest';
import { resolveOptions } from '../../src/app/resolveView.ts';
import type { Resolution } from '../../src/model/index.ts';

const choice = (short: string, text: string | null, reason?: string) =>
  ({ path: `p-${short}`, name: `${short} · EG1`, short, suggestion: text === null ? null : { change: {}, text }, ...(reason ? { reason } : {}) });

describe('resolveOptions', () => {
  it('words a suggestion as "Enc2 → CC 16"', () => {
    const r: Resolution = { choices: [choice('Enc2', 'CC 16'), choice('Enc1', 'CC 17')], sideBySide: false };
    expect(resolveOptions(r)).toEqual([
      { choice: 0, short: 'Enc2', label: 'Enc2 → CC 16', text: 'CC 16', ok: true },
      { choice: 1, short: 'Enc1', label: 'Enc1 → CC 17', text: 'CC 17', ok: true },
    ]);
  });
  it('gives the reason and no action when there is no suggestion', () => {
    const r: Resolution = { choices: [choice('Enc2', null, 'No free CC')], sideBySide: false };
    expect(resolveOptions(r)).toEqual([{ choice: 0, short: 'Enc2', label: 'Enc2: No free CC', text: null, ok: false }]);
  });
  it('offers nothing for a stale item', () => {
    expect(resolveOptions({ choices: [], sideBySide: false })).toEqual([]);
  });
});
