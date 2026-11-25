import { describe, expect, it } from 'vitest';
import { clearTexts, CONNECTIONS_KEY, deleteNeededTexts, dumpKindLabel, keptNote, keptRow, loadOpen, saveOpen, shownDumps, stripInfo } from '../../src/app/connections.ts';
import { hasWorkToClear, type ClearPlan, type KeptDumpInfo } from '../../src/storage/index.ts';

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
    const l = [1, 2, 3, 4, 5, 6, 7].map((n) => dump({ id: 'd' + n }));
    expect(shownDumps(l, false)).toHaveLength(5);
    expect(shownDumps(l, true)).toHaveLength(7);
  });
  it('names the setups a delete would hurt, and says it cannot be undone', () => {
    const t = deleteNeededTexts(dump(), [{ setupId: 's', setupName: 'Lead', slot: 5, reasons: ['revert', 'sndc-export'] }]);
    expect(t.list?.[0]).toBe('SE05 "Lead" can no longer be reverted to this dump or exported alone as .syx (Sndc).');
    expect(t.body.join(' ')).toContain('cannot be undone');
  });
  it('lists only visible dumps, and hidden ones too under Show all', () => {
    const l = [dump({ id: 'a' }), dump({ id: 'b', hidden: true }), dump({ id: 'c' })];
    expect(shownDumps(l, false).map((d) => d.id)).toEqual(['a', 'c']);
    expect(shownDumps(l, true)).toHaveLength(3);
    expect(shownDumps([dump({ hidden: true })], false)).toHaveLength(0);
  });
  it('says why a hidden dump stays', () => {
    expect(keptNote(dump({ hidden: true, keptFor: { backup: true, setups: [] } }))).toBe('backup');
    expect(keptNote(dump({ hidden: true, keptFor: { backup: false, setups: [{ setupId: 'x', setupName: 'A', slot: 5, reasons: ['revert'] }, { setupId: 'y', setupName: 'B', slot: 9, reasons: ['revert'] }] } }))).toBe('kept for SE05, SE09');
    expect(keptNote(dump({ hidden: true, keptFor: { backup: true, setups: [{ setupId: 'x', setupName: 'A', slot: 5, reasons: ['revert'] }] } }))).toBe('backup / kept for SE05');
    const many = Array.from({ length: 18 }, (_, i) => ({ setupId: 's' + i, setupName: 'S', slot: i + 1, reasons: ['revert' as const] }));
    expect(keptNote(dump({ hidden: true, keptFor: { backup: true, setups: many } }))).toBe('backup / kept for 18 setups');
    expect(keptNote(dump())).toBe('');
  });
  it('clears when there is something to delete or to hide, not otherwise', () => {
    expect(hasWorkToClear({ deleteIds: [], hideIds: [] })).toBe(false);
    expect(hasWorkToClear({ deleteIds: ['a'], hideIds: [] })).toBe(true);
    expect(hasWorkToClear({ deleteIds: [], hideIds: ['b'] })).toBe(true);
  });
  it('says what goes, what is kept hidden and that the list ends up empty', () => {
    const plan: ClearPlan = {
      deleteIds: ['a'], keepIds: ['b'], hideIds: ['b'],
      entries: [
        { id: 'b', date: '2026-11-16T10:00:00.000Z', kind: 'Sndc SE05', action: 'keep', keepBecause: ['backup', 'needed'], neededBy: [{ setupId: 's', setupName: 'Lead', slot: 5, reasons: ['revert'] }] },
        { id: 'a', date: '2026-11-15T10:00:00.000Z', kind: 'Sndc SE05', action: 'delete', keepBecause: [], neededBy: [] },
      ],
    };
    const t = clearTexts(plan);
    expect(t.title).toBe('Clear 1 old dump?');
    expect(t.body.join(' ')).toContain('The list will be empty');
    expect(t.body.join(' ')).toContain('Show all brings it back');
    expect(t.body.join(' ')).toContain('1 dump stays, hidden: your backup for Restore and the dumps setups need.');
    expect(t.body.join(' ')).toContain('cannot be undone');
    expect(t.list?.[0]).toContain('Kept, hidden: Sndc SE05');
    expect(t.list?.[0]).toContain('(backup / kept for SE05)');
    expect(t.list?.[1]).toContain('Goes: Sndc SE05');
  });
  it('never says "Clear 0 old dumps" when it only hides', () => {
    const t = clearTexts({ deleteIds: [], keepIds: ['b'], hideIds: ['b'], entries: [{ id: 'b', date: '2026-11-16T10:00:00.000Z', kind: 'SndA', action: 'keep', keepBecause: ['backup'], neededBy: [] }] });
    expect(t.title).toBe('Clear the dump list?');
    expect(t.confirmLabel).toBe('Clear the list');
    expect(t.body.join(' ')).toContain('1 dump stays, hidden: your backup for Restore. Show all brings it back.');
    expect(t.body.join(' ')).not.toContain('cannot be undone');
  });
});
