import { describe, expect, it } from 'vitest';
import type { KeptDumpInfo } from '../../src/storage/index.ts';
import { deleteDumpTexts, dumpSource, revertTexts } from '../../src/app/dumpTexts.ts';

const dump = (over: Partial<KeptDumpInfo> = {}): KeptDumpInfo => ({
  id: 'd1', date: '2026-11-15T10:30:00.000Z', source: 'file', fileName: 'base.syx', type: 'one', slots: [16], firmware: '02.05', content: 'SE16', size: 1234, ...over,
});

describe('kept dump texts', () => {
  it('names the source: the file name, or received', () => {
    expect(dumpSource(dump())).toBe('base.syx');
    expect(dumpSource(dump({ source: 'received', fileName: undefined }))).toBe('received from the UC4');
    expect(dumpSource(dump({ fileName: undefined }))).toBe('file');
  });
  it('says what a revert loses and that undo brings it back', () => {
    const t = revertTexts('My setup', dump());
    expect(t.title).toContain('My setup');
    expect(t.body[0]).toContain('Lost: every edit');
    expect(t.body[1]).toContain('Cmd-Z');
  });
  it('says what a delete loses, and that it cannot be undone', () => {
    expect(deleteDumpTexts(dump(), 0).body[0]).toContain('No setup is linked');
    expect(deleteDumpTexts(dump(), 2).body[0]).toContain('2 setups can no longer be reverted');
    expect(deleteDumpTexts(dump(), 1).body[0]).toContain('1 setup can no longer');
    expect(deleteDumpTexts(dump(), 0).body[1]).toContain('cannot be undone');
  });
});
