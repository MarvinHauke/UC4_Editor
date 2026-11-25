import { describe, expect, it } from 'vitest';
import { clearTexts, CONNECTIONS_KEY, deleteNeededTexts, dumpKindLabel, keptRow, loadOpen, saveOpen, shownDumps, stripInfo } from '../../src/app/connections.ts';
import type { ClearPlan, KeptDumpInfo } from '../../src/storage/index.ts';

const dump = (over: Partial<KeptDumpInfo> = {}): KeptDumpInfo => ({
  id: 'd1', date: '2026-11-15T10:30:00.000Z', source: 'received', type: 'one', slots: [5], firmware: '', content: 'SE05', size: 100, ...over,
});

describe('Connections column', () => {
  it('states the strip in words', () => {
    expect(stripInfo('UC4', { kind: 'connected', port: { id: '1', name: 'x' } }, 0)).toMatchObject({ text: 'UC4 connected', tone: 'on' });
    expect(stripInfo('UC4', { kind: 'not-connected', access: false, message: '' }, 2).label).toBe('Connections: UC4 not connected, 2 dumps received');
    expect(stripInfo('UC4', { kind: 'choose-port', candidates: [] }, 1).tone).toBe('warn');
  });
  it('remembers open and closed, and survives blocked storage', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
    expect(loadOpen(storage)).toBe(false);
    saveOpen(true, storage);
    expect(mem.get(CONNECTIONS_KEY)).toBe('open');
    expect(loadOpen(storage)).toBe(true);
    const blocked = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } };
    expect(loadOpen(blocked)).toBe(false);
    expect(() => { saveOpen(true, blocked); }).not.toThrow();
  });
  it('names the kind and the source of a row', () => {
    expect(dumpKindLabel(dump())).toBe('Sndc SE05');
    expect(dumpKindLabel(dump({ type: 'all', slots: [] }))).toBe('SndA');
    expect(keptRow(dump({ source: 'file', fileName: 'a.syx' })).meta).toContain('a.syx');
    expect(keptRow(dump()).meta).toMatch(/^received · /);
  });
  it('shows the 5 newest unless all are asked for', () => {
    const l = [1, 2, 3, 4, 5, 6, 7];
    expect(shownDumps(l, false)).toHaveLength(5);
    expect(shownDumps(l, true)).toHaveLength(7);
  });
  it('names the setups a delete would hurt, and says it cannot be undone', () => {
    const t = deleteNeededTexts(dump(), [{ setupId: 's', setupName: 'Lead', slot: 5, reasons: ['revert', 'sndc-export'] }]);
    expect(t.list?.[0]).toBe('SE05 "Lead" can no longer be reverted to this dump or exported alone as .syx (Sndc).');
    expect(t.body.join(' ')).toContain('cannot be undone');
  });
  it('says what goes, what stays and why when clearing', () => {
    const plan: ClearPlan = {
      deleteIds: ['a'], keepIds: ['b'], hideIds: ['b'],
      entries: [
        { id: 'b', date: '2026-11-16T10:00:00.000Z', kind: 'Sndc SE05', action: 'keep', keepBecause: ['backup', 'needed'], neededBy: [{ setupId: 's', setupName: 'Lead', slot: 5, reasons: ['revert'] }] },
        { id: 'a', date: '2026-11-15T10:00:00.000Z', kind: 'Sndc SE05', action: 'delete', keepBecause: [], neededBy: [] },
      ],
    };
    const t = clearTexts(plan);
    expect(t.body.join(' ')).toContain('the backup for Restore (the newest SndA received from the UC4)');
    expect(t.title).toBe('Clear 1 old dump?');
    expect(t.list?.[0]).toContain('Stays: Sndc SE05');
    expect(t.list?.[0]).toContain('the backup for Restore; needed by SE05');
    expect(t.list?.[1]).toContain('Goes: Sndc SE05');
    expect(t.body.join(' ')).toContain('cannot be undone');
  });
});
