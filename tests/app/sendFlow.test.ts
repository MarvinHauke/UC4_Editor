import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SendPlan } from '../../src/storage/index.ts';
import { sendCheck, restoreView, whenOf, failedLine, matchLine, sameBytes, sendView, sentLine } from '../../src/app/sendFlow.ts';

const ok = (lines: string[], more = 0, total = lines.length + more, over: Partial<Extract<SendPlan, { ok: true }>> = {}): SendPlan => ({
  ok: true, bytes: new Uint8Array([0xf0, 0xf7]), changes: { lines, items: lines.map((text) => text.startsWith('Encoder group 1: name') ? { text, name: { group: 1, from: 'grp1', to: 'send' } } : { text }), more, total },
  base: { kind: 'SndA', dumpId: 'd', receivedAt: '2026-11-18T09:41:00.000Z' },
  backup: { dumpId: 'd', receivedAt: '2026-11-18T09:41:00.000Z' }, ...over,
});
const dateOf = (): string => '2026-11-17 01:49';
const view = (plan: SendPlan, slot = 5, name = 'x') => sendView(plan, slot, name, 'UC4', dateOf);

describe('sendView', () => {
  it('spells group names as the display shows them', () => {
    const v = view(ok(['Encoder group 1: name grp1 → send', 'Enc1, encoder group 1: number 8 → 99']));
    expect(v.kind === 'confirm' && v.changes).toEqual(['Encoder group 1: name GrP1 → SEnd', 'Enc1, encoder group 1: number 8 → 99']);
  });
  it('asks to send a setup and says what it replaces and what the backup holds', () => {
    const v = view(ok(['Encoder group 1: name GrP1 → send']), 5, 'Hand made');
    expect(v).toMatchObject({ kind: 'confirm', title: 'Send SE05 "Hand made" to the UC4?', replaces: 'It replaces SE05 on the device.', moreLine: null, noChanges: null });
    expect(v.kind === 'confirm' && v.backup).toMatchObject({ has: true });
    expect(v.kind === 'confirm' && v.backup.text).toMatch(/^A send can't be undone in the editor\. Your backup from \d\d:\d\d holds the old state\.$/);
  });
  it('counts the changes it leaves out', () => {
    expect(view(ok(['a', 'b'], 12))).toMatchObject({ moreLine: '+ 12 more' });
  });
  it('names what the changes compare against', () => {
    const title = (p: SendPlan): string => (view(p) as { changesTitle: string }).changesTitle;
    expect(title(ok(['a']))).toMatch(/^Changes on the UC4 \(backup SndA of \d\d:\d\d\)$/);
    expect(title(ok(['a'], 0, 1, { base: { kind: 'Sndc', dumpId: 'k' } }))).toBe("Changes since the setup's Sndc of 2026-11-17 01:49");
    expect(sendView(ok(['a'], 0, 1, { base: { kind: 'Sndc', dumpId: 'gone' } }), 5, 'x', 'UC4', () => '')).toMatchObject({ changesTitle: "Changes since the setup's Sndc" });
    expect(title(ok(['a'], 0, 1, { base: { kind: 'factory' } }))).toBe('Changes from the factory setup');
  });
  it('says no changes against that base, and still offers the send', () => {
    expect(view(ok([], 0, 0, { base: { kind: 'factory' } }))).toMatchObject({ kind: 'confirm', noChanges: expect.stringContaining('factory') });
    expect(view(ok([], 0, 0))).toMatchObject({ noChanges: 'No changes: SE05 is the same as on the UC4.' });
  });
  it('says plainly that there is no backup, and what to do', () => {
    const v = view(ok(['a'], 0, 1, { backup: null }), 5);
    expect(v.kind === 'confirm' && v.backup).toEqual({ has: false, text: "No backup from the UC4: the old SE05 can't be restored. Press SndA first if you want one." });
  });
  it("shows a refusal in the refusal's own words (build or send)", () => {
    for (const kind of ['cannot build', 'cannot send'] as const) {
      const v = view({ ok: false, refusal: { kind, reason: 'No base.', fields: ['Enc1'], whatToDo: 'Do this.' } });
      expect(v).toEqual({ kind: 'refused', title: 'SE05 "x" cannot be sent', reason: 'No base.', whatToDo: 'Do this.', fields: ['Enc1'] });
    }
  });
});

describe('after a send', () => {
  it('says the UC4 shows the slot, and to send again on Err', () => {
    expect(sentLine(5, 'UC4')).toBe("Sent SE05. The UC4 shows SE05 when it's stored. If it shows Err, SE05 may be half written: send again.");
    expect(matchLine(16, 'UC4')).toBe('SE16 on the UC4 matches the editor');
  });
  it('says nothing was sent after a failure, once', () => {
    expect(failedLine('No output.')).toBe('No output. Nothing was sent.');
    expect(failedLine('Bad bytes; nothing was sent.')).toBe('Bad bytes; nothing was sent.');
  });
  it('compares byte for byte', () => {
    expect(sameBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(sameBytes(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(sameBytes(new Uint8Array([1, 2]), new Uint8Array([1]))).toBe(false);
  });
});

describe('restoreView', () => {
  // whenOf shows only the time for a backup from today: pin today to the backup's day.
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-18T12:00:00.000Z')); });
  afterEach(() => { vi.useRealTimers(); });
  const dateOf = (iso: string): string => iso.slice(0, 10);
  const plan = (over: object = {}) => ({ ok: true as const, bytes: new Uint8Array([0xf0, 0xf7]), backup: { dumpId: 'd', receivedAt: '2026-11-18T09:41:00.000Z' },
    against: { kind: 'sent' as const, sentAt: '2026-11-18T10:00:00.000Z' }, changes: { lines: ['a'], items: [{ text: 'Encoder group 1: name grp1 → send', name: { group: 1, from: 'grp1', to: 'send' } }], more: 0, total: 1 }, ...over });
  it('asks to restore from the backup, naming what stays', () => {
    const v = restoreView(plan(), 16, 'x', 'UC4', dateOf);
    expect(v).toMatchObject({ kind: 'confirm', replaces: "It replaces SE16 on the UC4 with the backup; the editor's SE16 stays as it is.", changesTitle: 'Changes against what was sent on 2026-11-18' });
    expect(v.kind === 'confirm' && v.title).toMatch(/^Restore SE16 from the backup SndA of \d\d:\d\d\?$/);
    expect(v.kind === 'confirm' && v.changes).toEqual(['Encoder group 1: name GrP1 → SEnd']);
  });
  it('says the UC4 state is unknown when the editor has seen nothing since the backup', () => {
    const v = restoreView(plan({ against: null, changes: null }), 16, 'x', 'UC4', dateOf);
    expect(v).toMatchObject({ kind: 'confirm', changesTitle: null, noChanges: "The UC4's current state is unknown, so the changes cannot be listed." });
  });
  it('shows a refusal in its own words', () => {
    const v = restoreView({ ok: false, refusal: { kind: 'no backup', reason: 'No backup.', whatToDo: 'Press SndA.' } }, 16, 'x', 'UC4', dateOf);
    expect(v).toEqual({ kind: 'refused', title: 'SE16 "x" cannot be restored', reason: 'No backup.', whatToDo: 'Press SndA.', fields: [] });
  });
});

describe('whenOf', () => {
  it('shows the time for today and the date for another day', () => {
    const now = new Date(2026, 10, 18, 12, 0);
    expect(whenOf(new Date(2026, 10, 18, 4, 29).toISOString(), now)).toBe('04:29');
    expect(whenOf(new Date(2026, 10, 17, 4, 29).toISOString(), now)).toBe('2026-11-17 04:29');
  });
});

describe('the check line of the Send dialog (decision 30)', () => {
  it('names the open warnings', () => { expect(sendCheck(2, 1)).toEqual({ clear: false, text: '2 warnings in this setup' }); });
  it('says what was checked when none are open', () => {
    expect(sendCheck(0, 3)).toEqual({ clear: true, text: 'No open warnings · 3 ignored' });
    expect(sendCheck(0, 0)).toEqual({ clear: true, text: 'No open warnings' });
  });
});
