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
    expect(plannedText('CC 70', [{ property: 'number', suggested: 70, after: 33 }])).toBe('CC 33');
    expect(plannedText('CC 70', [{ property: 'number', suggested: 70, after: 70 }])).toBe('CC 70');
  });
  it('shows a program block\'s edits as they are planned (lower and upper are separate lines)', () => {
    // One end edited: the plan really holds a reversed range (lower 20, upper 17), and the text says so.
    expect(plannedText('programs 15–17', [{ property: 'lower', suggested: 15, after: 20 }])).toBe('programs 20–17');
    expect(plannedText('programs 15–17', [{ property: 'lower', suggested: 15, after: 20 }, { property: 'upper', suggested: 17, after: 22 }])).toBe('programs 20–22');
  });
  it('tells the channel from the number', () => {
    const t = 'CC 2 on ch 2';
    expect(plannedText(t, [{ property: 'channel', suggested: 2, after: 5 }])).toBe('CC 2 on ch 5');
    expect(plannedText(t, [{ property: 'number', suggested: 2, after: 9 }])).toBe('CC 9 on ch 2');
    expect(plannedText(t, [{ property: 'number', suggested: 2, after: 9 }, { property: 'channel', suggested: 2, after: 12 }])).toBe('CC 9 on ch 12');
  });
});

describe('withPlanned', () => {
  const r: Resolution = { choices: [{ ...choice('Enc2', 'CC 9 on ch 2'), suggestion: { change: { number: 9, channel: 2 }, text: 'CC 9 on ch 2' } }, choice('Enc1', 'CC 17')], sideBySide: false };
  const entry = (property: 'number' | 'channel', after: number) => ({ path: 'p', property, before: 1, after });
  it('shows every edited After on the picked option only', () => {
    const o = withPlanned(resolveOptions(r), r, { choice: 0, entries: [entry('channel', 3), entry('number', 33)] });
    expect(o[0]!.label).toBe('Enc2 → CC 33 on ch 3');
    expect(o[1]!.label).toBe('Enc1 → CC 17');
  });
  it('changes nothing without a pick', () => { expect(withPlanned(resolveOptions(r), r, null)[0]!.label).toBe('Enc2 → CC 9 on ch 2'); });
});
