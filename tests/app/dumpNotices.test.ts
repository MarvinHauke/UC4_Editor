import { describe, expect, it } from 'vitest';
import { drop, enqueue, keepExisting, noticeOf, noticeText, withImportHook, type DumpNotice } from '../../src/app/dumpNotices.ts';
import type { FlowLibrary } from '../../src/app/importFlow.ts';
import type { KeepResult } from '../../src/storage/index.ts';

const n = (dumpId: string, content = 'SE16'): DumpNotice => ({ dumpId, content, warnings: [] });

describe('dump notice queue', () => {
  it('queues dumps in order and says how many more wait', () => {
    let q = enqueue([], n('a', 'SE16'));
    expect(noticeText(q)).toBe('Dump received: SE16');
    q = enqueue(q, n('b', 'all 18 setups'));
    expect(noticeText(q)).toBe('Dump received: SE16 (+1 more)');
    q = drop(q, 'a');
    expect(noticeText(q)).toBe('Dump received: all 18 setups');
    expect(noticeText(drop(q, 'b'))).toBe('');
  });
  it('the same kept dump arriving twice is one notice', () => {
    const q = enqueue([], n('a'));
    expect(enqueue(q, n('a'))).toBe(q); // the same array: nothing changes, so nothing re-runs
    expect(enqueue(q, n('a'))).toHaveLength(1);
  });
  it('dropping one that is not there changes nothing', () => {
    expect(drop([n('a')], 'zzz')).toHaveLength(1);
  });
  it('says unreadable with the reason', () => {
    const q = enqueue([], { ...n('a', 'unreadable dump'), unreadable: { reason: 'the checksum does not match', whatToDo: 'send it again' } });
    expect(noticeText(q)).toBe('Dump received but unreadable: the checksum does not match');
  });
  it('makes a notice from what the library kept, and none from a refused message', () => {
    const kept = { status: 'kept', dump: { id: 'd1' }, content: 'SE03', slots: [3], warnings: ['w'] } as unknown as KeepResult;
    expect(noticeOf(kept)).toEqual({ dumpId: 'd1', content: 'SE03', warnings: ['w'] });
    expect(noticeOf({ status: 'refused', reason: 'x', whatToDo: 'y' } as KeepResult)).toBeNull();
  });
});

describe('withImportHook', () => {
  const lib = (status: string) => ({
    getState: () => ({}), inspectImport: () => ({}), exportWhole: () => ({}), exportSetup: () => ({}),
    importFile: () => ({ status }),
  }) as unknown as FlowLibrary;
  it('runs the hook only when the import happened', () => {
    let dropped = 0;
    expect(withImportHook(lib('imported'), () => { dropped++; }).importFile('x').status).toBe('imported');
    expect(dropped).toBe(1);
    for (const status of ['slot-occupied', 'needs-slot', 'refused']) withImportHook(lib(status), () => { dropped++; }).importFile('x');
    expect(dropped).toBe(1);
  });
});

describe('keepExisting', () => {
  it('drops the notices of a dump that was deleted', () => {
    expect(keepExisting([n('a'), n('b')], ['b']).map((x) => x.dumpId)).toEqual(['b']);
  });
});

describe('duplicate dumps', () => {
  it('the notice says the dump is the same as the kept one', () => {
    const n = { dumpId: 'a', content: 'SE16', warnings: [], duplicateOf: { id: 'a', date: new Date(2026, 10, 16, 10, 30).toISOString() } };
    expect(noticeText([n])).toBe('Dump received: SE16, same as the dump of 2026-11-16 10:30');
  });
  it('noticeOf carries duplicateOf', () => {
    const date = new Date(2026, 10, 16, 10, 30).toISOString();
    const n = noticeOf({ status: 'kept', dump: { id: 'a' } as never, content: 'SE16', slots: [16], warnings: [], duplicateOf: { id: 'a', date } });
    expect(n?.duplicateOf).toEqual({ id: 'a', date });
  });
});
