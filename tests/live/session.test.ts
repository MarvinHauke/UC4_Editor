import { describe, expect, it } from 'vitest';
import { createLiveSession, type ChannelEvent, type ChannelMessage } from '../../src/live/index.ts';

let t = 0;
const ev = (message: ChannelMessage, o: { inputId?: string; isUc4?: boolean } = {}): ChannelEvent => ({
  message, inputId: o.inputId ?? 'in1', isUc4: o.isUc4 ?? true, at: ++t,
});
const cc = (channel: number, number: number, value: number): ChannelMessage => ({ kind: 'cc', channel, number, value });

describe('monitor rows', () => {
  it('starts empty', () => {
    const s = createLiveSession();
    expect(s.rows).toEqual([]);
    expect(s.lastMovedKey).toBeNull();
  });

  it('adds one row per new key on top, newest first', () => {
    const s = createLiveSession();
    s.receive(ev(cc(16, 8, 10)));
    s.receive(ev(cc(16, 9, 20)));
    s.receive(ev({ kind: 'note', channel: 1, number: 64, value: 127, on: true }));
    expect(s.rows.map((r) => r.key)).toEqual(['note:1:64', 'cc:16:9', 'cc:16:8']);
  });

  it('updates a known key in place: same place, new value, count up', () => {
    const s = createLiveSession();
    s.receive(ev(cc(16, 8, 10)));
    s.receive(ev(cc(16, 9, 20)));
    s.receive(ev(cc(16, 8, 55)));
    expect(s.rows.map((r) => [r.key, r.value, r.count])).toEqual([['cc:16:9', 20, 1], ['cc:16:8', 55, 2]]);
  });

  it('marks the row that moved last, and only that one', () => {
    const s = createLiveSession();
    s.receive(ev(cc(1, 1, 1)));
    s.receive(ev(cc(1, 2, 1)));
    s.receive(ev(cc(1, 1, 2)));
    expect(s.lastMovedKey).toBe('cc:1:1');
    expect(s.rows.filter((r) => r.lastMoved).map((r) => r.key)).toEqual(['cc:1:1']);
  });

  it('tells apart type, channel and number', () => {
    const s = createLiveSession();
    s.receive(ev(cc(1, 8, 1)));
    s.receive(ev(cc(2, 8, 1)));
    s.receive(ev(cc(1, 9, 1)));
    s.receive(ev({ kind: 'note', channel: 1, number: 8, value: 1, on: true }));
    s.receive(ev({ kind: 'polyAftertouch', channel: 1, number: 8, value: 1 }));
    expect(s.rows).toHaveLength(5);
  });

  it('keeps note on and off on one row with the on flag', () => {
    const s = createLiveSession();
    s.receive(ev({ kind: 'note', channel: 1, number: 64, value: 127, on: true }));
    s.receive(ev({ kind: 'note', channel: 1, number: 64, value: 0, on: false }));
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0]).toMatchObject({ value: 0, on: false, count: 2 });
  });

  it('lists pitch bend and channel aftertouch without a number, program change with it', () => {
    const s = createLiveSession();
    s.receive(ev({ kind: 'pitchBend', channel: 3, number: null, value: 16383 }));
    s.receive(ev({ kind: 'aftertouch', channel: 3, number: null, value: 5 }));
    s.receive(ev({ kind: 'program', channel: 3, number: 12, value: 0 }));
    expect(s.rows.map((r) => [r.key, r.number])).toEqual([['program:3:12', 12], ['aftertouch:3:', null], ['pitchBend:3:', null]]);
  });

  it('carries the source: input id, UC4 mark and time of the latest message', () => {
    const s = createLiveSession();
    s.receive(ev(cc(1, 1, 1), { inputId: 'a', isUc4: false }));
    s.receive(ev(cc(1, 1, 2), { inputId: 'b', isUc4: true }));
    expect(s.rows[0]).toMatchObject({ inputId: 'b', isUc4: true, at: t });
  });

  it('ignores a message out of range instead of throwing', () => {
    const s = createLiveSession();
    s.receive(ev(cc(0, 1, 1)));
    s.receive(ev(cc(17, 1, 1)));
    s.receive(ev(cc(1, 128, 1)));
    s.receive(ev(cc(1, 1, 200)));
    s.receive(ev({ kind: 'pitchBend', channel: 1, number: null, value: 16384 }));
    s.receive(ev({ kind: 'cc', channel: 1, number: null, value: 1 }));
    expect(s.rows).toEqual([]);
  });

  it('hands out a new rows array on every change, never mutating a snapshot', () => {
    const s = createLiveSession();
    s.receive(ev(cc(1, 1, 1)));
    const before = s.rows;
    const first = before[0]!;
    s.receive(ev(cc(1, 1, 2)));
    expect(s.rows).not.toBe(before);
    expect(first.value).toBe(1);
    expect(before[0]!.value).toBe(1);
  });

  it('caps the number of rows, dropping the oldest keys', () => {
    const s = createLiveSession({ maxRows: 3 });
    for (let n = 0; n < 5; n++) s.receive(ev(cc(1, n, 1)));
    expect(s.rows.map((r) => r.number)).toEqual([4, 3, 2]);
  });
});

describe('clear and subscribe', () => {
  it('clears every row and the marker', () => {
    const s = createLiveSession();
    s.receive(ev(cc(1, 1, 1)));
    s.clear();
    expect(s.rows).toEqual([]);
    expect(s.lastMovedKey).toBeNull();
    s.receive(ev(cc(1, 1, 5)));
    expect(s.rows[0]).toMatchObject({ value: 5, count: 1 });
  });

  it('notifies after a message and after Clear, not on a no-op, and unsubscribes', () => {
    const s = createLiveSession();
    let n = 0;
    const off = s.subscribe(() => n++);
    s.clear();
    expect(n).toBe(0);
    s.receive(ev(cc(1, 1, 1)));
    s.clear();
    expect(n).toBe(2);
    off();
    s.receive(ev(cc(1, 1, 1)));
    expect(n).toBe(2);
  });
});
