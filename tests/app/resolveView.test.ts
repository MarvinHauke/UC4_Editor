import { describe, expect, it } from 'vitest';
import { plannedText, resolveOptions, withPlanned } from '../../src/app/resolveView.ts';
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

describe('plannedText', () => {
  it('shows the edited value in the suggestion\'s words', () => {
    expect(plannedText('CC 70', 70, 33)).toBe('CC 33');
    expect(plannedText('CC 9 on ch 2', 9, 12)).toBe('CC 12 on ch 2');
    expect(plannedText('CC 70', 70, 70)).toBe('CC 70');
    expect(plannedText('programs 15–17', 15, 20)).toBe('programs 20–17');
  });
});

describe('withPlanned', () => {
  const r: Resolution = { choices: [{ ...choice('Enc2', 'CC 16'), suggestion: { change: { number: 16 }, text: 'CC 16' } }, choice('Enc1', 'CC 17')], sideBySide: false };
  it('shows the edited After on the picked option only', () => {
    const o = withPlanned(resolveOptions(r), r, { choice: 0, entry: { path: 'p', property: 'number', before: 1, after: 99 } });
    expect(o[0]!.label).toBe('Enc2 → CC 99');
    expect(o[1]!.label).toBe('Enc1 → CC 17');
  });
  it('changes nothing without a pick', () => { expect(withPlanned(resolveOptions(r), r, null)[0]!.label).toBe('Enc2 → CC 16'); });
});
