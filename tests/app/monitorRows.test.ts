import { describe, expect, it } from 'vitest';
import { INPUT_KEY, loadSelection, pickerOptions, rowLabel, rowText, saveSelection, sourceName, statusLine, matchText } from '../../src/app/monitorRows.ts';
import type { LiveRow } from '../../src/live/index.ts';

const row = (p: Partial<LiveRow>): LiveRow => ({
  key: 'a|cc:2:74', kind: 'cc', channel: 2, number: 74, value: 64, on: null, inputId: 'a', isUc4: false, at: 0, count: 1, lastMoved: false, matches: [], best: null, more: 0, pinned: false, pair: null, mappedTo: null, valueText: '64', ...p,
});

describe('rowText', () => {
  it('names the message per kind', () => {
    expect(rowText(row({}))).toEqual({ message: 'CC 74', channel: '2' });
    expect(rowText(row({ kind: 'note', number: 60 })).message).toBe('Note 60');
    expect(rowText(row({ kind: 'pitchBend', number: null }))).toEqual({ message: 'Bend', channel: '2' });
  });
  it('labels a row with its source for screen readers', () => {
    expect(rowLabel(row({ isUc4: true }), 'Faderfox UC4')).toBe('CC 74 ch 2, 64, from Faderfox UC4 (the UC4)');
    expect(rowLabel(row({ kind: 'pitchBend', number: null, value: 8192, valueText: '8192' }), 'Synth')).toBe('Bend ch 2, 8192, from Synth');
  });
  it('adds the match, pinned and the others to the label', () => {
    const best = { control: { id: 'x', setupId: 's', setupName: 'SE01', area: 'faders', group: 0, index: 0, name: 'FAd1 · FG1' }, tier: 1, via: 'message' } as LiveRow['best'];
    expect(rowLabel(row({ isUc4: true, best, more: 1, pinned: true }), 'UC4')).toBe('CC 74 ch 2, 64, from UC4 (the UC4), FAd1 · FG1 (pinned), 1 more');
  });
  it('names the source, also when it is gone', () => {
    expect(sourceName(row({}), [{ id: 'a', name: 'Synth', isUc4: false }])).toBe('Synth');
    expect(sourceName(row({}), [])).toBe('an input that is not connected');
  });
});

describe('remembered input', () => {
  const fake = (init?: string) => {
    const m = new Map<string, string>(init ? [[INPUT_KEY, init]] : []);
    return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
  };
  it('defaults to all and round-trips', () => {
    expect(loadSelection(fake())).toBe('all');
    const s = fake();
    saveSelection('in-7', s);
    expect(loadSelection(s)).toBe('in-7');
  });
  it('survives blocked storage', () => {
    const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadSelection(bad)).toBe('all');
    expect(() => { saveSelection('x', bad); }).not.toThrow();
    expect(loadSelection(null)).toBe('all');
  });
});

describe('pickerOptions', () => {
  const inputs = [{ id: 'a', name: 'Faderfox UC4', isUc4: true }, { id: 'b', name: 'Synth', isUc4: false }];
  it('lists all, the inputs and keeps an unplugged choice', () => {
    expect(pickerOptions(inputs, 'all').map((o) => o.label)).toEqual(['All inputs', 'Faderfox UC4 (UC4)', 'Synth']);
    expect(pickerOptions(inputs, 'gone').at(-1)).toEqual({ value: 'gone', label: 'Chosen input (not connected)' });
  });
});

describe('statusLine and matchText', () => {
  it('folds the clock note into the status line', () => {
    expect(statusLine('Listening to 6 inputs…', true, true)).toBe('Listening to 6 inputs · clock ignored');
    expect(statusLine('Listening to 6 inputs…', true, false)).toBe('Listening to 6 inputs…');
    expect(statusLine('No MIDI input found.', false, true)).toBe('No MIDI input found.');
  });
  it('shows the best match with its count, or the mapped control', () => {
    const control = { name: 'FAd7 · FG1' } as never;
    expect(matchText({ best: { control, tier: 1, via: 'message' }, more: 1, mappedTo: null })).toBe('FAd7 · FG1 +1');
    expect(matchText({ best: { control, tier: 1, via: 'message' }, more: 0, mappedTo: { name: 'Enc1 · EG1' } as never })).toBe('→ Enc1 · EG1');
    expect(matchText({ best: null, more: 0, mappedTo: null })).toBe('');
  });
});
