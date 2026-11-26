import { describe, expect, it } from 'vitest';
import { createLiveSession, type ChannelMessage, type LiveContext, type LiveSession } from '../../src/live/index.ts';
import { factorySetup } from '../../src/model/factory.ts';
import type { Setup, Uc4Config } from '../../src/model/types.ts';

let t = 0;
const send = (s: LiveSession, message: ChannelMessage, o: { inputId?: string; isUc4?: boolean } = {}) =>
  s.receive({ message, inputId: o.inputId ?? 'uc4', isUc4: o.isUc4 ?? true, at: ++t });
const cc = (channel: number, number: number, value: number): ChannelMessage => ({ kind: 'cc', channel, number, value });
const noteOn = (n: number, v = 127): ChannelMessage => ({ kind: 'note', channel: 1, number: n, value: v, on: true });
const noteOff = (n: number): ChannelMessage => ({ kind: 'note', channel: 1, number: n, value: 0, on: false });

function config(edit?: (se: Setup) => void): Uc4Config {
  const a = factorySetup(1);
  edit?.(a);
  return { format: 'uc4-config', schemaVersion: 1, device: { profile: 'faderfox-uc4' }, createdAt: '', updatedAt: '', setups: [a] };
}
const ctx = (configuration: Uc4Config): LiveContext => ({ configuration, setupId: 'factory-se01', encoderGroup: 0, faderButtonGroup: 0 });
/** SE01 with Enc1 · EG1 as a `CCAh` on CC 8 (so CC 8 is the coarse and CC 40 the fine half) and Enc2 as `CCr1` on CC 9. */
const ccah = (edit?: (se: Setup) => void) => config((se) => {
  const e = se.encoderGroups[0]!.encoders;
  e[0]!.type = 'CCAh';
  e[1]!.type = 'CCr1';
  edit?.(se);
});
const live = (c: Uc4Config) => { const s = createLiveSession(); s.setContext(ctx(c)); return s; };

describe('a CCAh pair', () => {
  it('is one row with a 14-bit value once both halves have been seen', () => {
    const s = live(ccah());
    send(s, cc(1, 8, 64));
    send(s, cc(1, 40, 1));
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0]).toMatchObject({
      key: 'uc4|ccah:1:8', kind: 'cc', number: 8, value: 64 * 128 + 1, valueText: '8193',
      pair: { key: 'uc4|ccah:1:8', kind: 'ccah', state: 'joined' }, best: { control: { name: 'Enc1 · EG1' } },
    });
  });

  it('updates in place from either half, goes to the top and is marked last-moved', () => {
    const s = live(ccah());
    send(s, cc(1, 40, 5));
    send(s, cc(1, 8, 1));
    send(s, cc(1, 99, 1)); // another row on top
    send(s, cc(1, 40, 6));
    expect(s.rows.map((r) => [r.key, r.value, r.lastMoved])).toEqual([['uc4|cc:1:99', 1, false], ['uc4|ccah:1:8', 134, true]]);
  });

  it('stays a single waiting row while the other half has not come', () => {
    const s = live(ccah());
    send(s, cc(1, 8, 64));
    expect(s.rows.map((r) => [r.key, r.value, r.pair?.state])).toEqual([['uc4|cc:1:8', 64, 'waiting']]);
  });

  it('stays two rows when no control of the open configuration is a CCAh', () => {
    const s = live(config());
    send(s, cc(1, 8, 64));
    send(s, cc(1, 40, 1));
    expect(s.rows.map((r) => [r.key, r.pair])).toEqual([['uc4|cc:1:40', null], ['uc4|cc:1:8', null]]);
    const none = createLiveSession();
    send(none, cc(1, 8, 64));
    send(none, cc(1, 40, 1));
    expect(none.rows).toHaveLength(2);
  });

  it('is not joined for another device\'s messages, nor when the halves come from two inputs', () => {
    const s = live(ccah());
    send(s, cc(1, 8, 64), { inputId: 'synth', isUc4: false });
    send(s, cc(1, 40, 1), { inputId: 'synth', isUc4: false });
    send(s, cc(1, 8, 64), { inputId: 'a' });
    send(s, cc(1, 40, 1), { inputId: 'b' });
    expect(s.rows).toHaveLength(4);
  });

  it('joins when the context arrives after the messages, and falls apart when the control stops being a CCAh', () => {
    const c = ccah();
    const s = createLiveSession();
    send(s, cc(1, 8, 64));
    send(s, cc(1, 40, 1));
    expect(s.rows).toHaveLength(2);
    s.setContext(ctx(c));
    expect(s.rows).toHaveLength(1);
    s.setContext(ctx(config()));
    expect(s.rows).toHaveLength(2);
  });

  it('exposes the parts of a joined row, and of a lone half', () => {
    const s = live(ccah());
    send(s, cc(1, 40, 5));
    expect(s.rows[0]).toMatchObject({ pair: { state: 'waiting', parts: { msb: null, lsb: 5 } } });
    send(s, cc(1, 8, 64));
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0]).toMatchObject({ value: 64 * 128 + 5, pair: { state: 'joined', parts: { msb: 64, lsb: 5 } } });
    send(s, cc(1, 40, 77));
    expect(s.rows[0]!.pair!.parts).toEqual({ msb: 64, lsb: 77 });
  });

  it('feeds the control state from the pair: a CCAh encoder shows its 14-bit position', () => {
    const s = live(ccah());
    send(s, cc(1, 8, 64));
    send(s, cc(1, 40, 0));
    expect([...s.controlStates.values()]).toMatchObject([{ kind: 'absolute', value: 8192 }]);
  });

  it('is pinned as one: the pin holds for the joined row and for either half', () => {
    // Two controls (Enc1 in EG1 and in EG2) are CCAh on the same pair.
    const s = live(ccah((se) => { const e = se.encoderGroups[1]!.encoders[0]!; e.type = 'CCAh'; e.number = 8; e.channel = 1; }));
    send(s, cc(1, 8, 1));
    send(s, cc(1, 40, 1));
    const key = s.rows[0]!.key;
    expect(s.rows[0]!.matches.map((m) => m.control.name)).toEqual(['Enc1 · EG1', 'Enc1 · EG2']);
    s.pin(key, s.rows[0]!.matches[1]!.control.id);
    expect(s.rows[0]).toMatchObject({ pinned: true, best: { control: { name: 'Enc1 · EG2' } } });
    s.pin(key, null);
    expect(s.rows[0]!.best?.control.name).toBe('Enc1 · EG1');
  });
});

describe('a note\'s press and release', () => {
  it('is one row: on 127, then off 0', () => {
    const s = live(config());
    send(s, noteOn(0));
    expect(s.rows[0]).toMatchObject({ valueText: 'on 127', pair: { key: 'uc4|note:1:0', kind: 'note', state: 'joined' } });
    send(s, noteOff(0));
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0]).toMatchObject({ valueText: 'off 0', on: false });
  });

  it('exposes the last on and the last off velocity as parts', () => {
    const s = live(config());
    send(s, noteOn(0, 100));
    expect(s.rows[0]!.pair!.parts).toEqual({ lastOn: 100, lastOff: null });
    send(s, noteOff(0));
    send(s, noteOn(0, 90));
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0]).toMatchObject({ valueText: 'on 90', count: 3, pair: { parts: { lastOn: 90, lastOff: 0 } } });
  });

  it('Clear forgets both parts', () => {
    const s = live(config());
    send(s, noteOn(0));
    s.clear();
    send(s, noteOff(0));
    expect(s.rows[0]!.pair!.parts).toEqual({ lastOn: null, lastOff: 0 });
  });

  it('also pairs another device\'s notes', () => {
    const s = live(config());
    send(s, noteOn(60), { inputId: 'synth', isUc4: false });
    expect(s.rows[0]).toMatchObject({ pair: { kind: 'note', state: 'joined' }, matches: [] });
  });
});

describe('use as plain functions', () => {
  it('pin works when taken off the session', () => {
    const s = live(ccah());
    send(s, cc(1, 8, 1));
    send(s, cc(1, 40, 1));
    const { pin } = s;
    expect(() => pin('uc4|ccah:1:8', null)).not.toThrow();
    expect(s.rows).toHaveLength(1);
  });

  it('keeps the objects of rows between messages that do not touch them', () => {
    const s = live(config());
    send(s, noteOn(0));
    send(s, noteOff(0));
    send(s, cc(1, 99, 1));
    const before = s.rows;
    send(s, cc(1, 99, 2));
    expect(s.rows[1]).toBe(before[1]);
  });
});

describe('value text', () => {
  it('prints raw values, 14-bit pitch bend and the relative tick of a CCr1/CCr2 match', () => {
    const s = live(config((se) => {
      se.encoderGroups[0]!.encoders[0]!.type = 'CCr1';
      se.encoderGroups[0]!.encoders[1]!.type = 'CCr2';
      se.faderButtonGroups[0]!.faders[0]!.type = 'Pbnd';
    }));
    send(s, cc(1, 8, 1));
    send(s, cc(1, 8, 127));
    send(s, cc(1, 9, 65));
    send(s, cc(1, 9, 63));
    send(s, cc(1, 10, 64)); // Enc3 is CCAb: raw
    send(s, { kind: 'pitchBend', channel: 1, number: null, value: 16383 });
    send(s, { kind: 'program', channel: 1, number: 3, value: 0 });
    send(s, cc(1, 8, 2));
    const text = (key: string) => s.rows.find((r) => r.key === key)!.valueText;
    expect(text('uc4|cc:1:8')).toBe('+2');
    send(s, cc(1, 8, 127));
    expect(text('uc4|cc:1:8')).toBe('−1');
    expect(text('uc4|cc:1:9')).toBe('−1');
    expect(text('uc4|cc:1:10')).toBe('64');
    expect(text('uc4|pitchBend:1:')).toBe('16383');
    expect(text('uc4|program:1:3')).toBe('—');
  });

  it('does not turn another device\'s relative-looking CC into ticks', () => {
    const s = live(config((se) => { se.encoderGroups[0]!.encoders[0]!.type = 'CCr1'; }));
    send(s, cc(1, 8, 127), { inputId: 'synth', isUc4: false });
    expect(s.rows[0]!.valueText).toBe('127');
  });

  it('takes garbage without throwing', () => {
    const s = createLiveSession();
    for (const bad of [null, undefined, 5, 'x', {}, { splits: 'x' }]) expect(() => s.restoreState(bad)).not.toThrow();
    expect(s.getState()).toEqual({ silenceOffers: false });
  });
});
