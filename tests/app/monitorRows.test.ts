import { describe, expect, it } from 'vitest';
import { INPUT_KEY, loadSelection, pickerOptions, rowLabel, rowText, saveSelection, sourceName } from '../../src/app/monitorRows.ts';
import type { MonitorRow } from '../../src/live/index.ts';

const row = (p: Partial<MonitorRow>): MonitorRow => ({
  key: 'a|cc:2:74', kind: 'cc', channel: 2, number: 74, value: 64, on: null, inputId: 'a', isUc4: false, at: 0, count: 1, lastMoved: false, ...p,
});

describe('rowText', () => {
  it('shows raw values per kind', () => {
    expect(rowText(row({}))).toEqual({ message: 'CC 74', channel: '2', value: '64' });
    expect(rowText(row({ kind: 'note', number: 60, value: 127, on: true })).value).toBe('on 127');
    expect(rowText(row({ kind: 'note', number: 60, value: 0, on: false })).value).toBe('off 0');
    expect(rowText(row({ kind: 'pitchBend', number: null, value: 16383 }))).toMatchObject({ message: 'Bend', value: '16383' });
    expect(rowText(row({ kind: 'program', number: 5, value: 0 })).value).toBe('—');
  });
  it('labels a row with its source for screen readers', () => {
    expect(rowLabel(row({ isUc4: true }), 'Faderfox UC4')).toBe('CC 74 ch 2, 64, from Faderfox UC4 (the UC4)');
    expect(rowLabel(row({ kind: 'pitchBend', number: null, value: 8192 }), 'Synth')).toBe('Bend ch 2, 8192, from Synth');
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
