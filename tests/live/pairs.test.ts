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

  it('can be split into its two messages and joined again; the other pairs are not touched', () => {
    const s = live(ccah((se) => { se.encoderGroups[0]!.encoders[2]!.type = 'CCAh'; })); // Enc3: CC 10 and 42
    for (const n of [8, 40, 10, 42]) send(s, cc(1, n, 3));
    expect(s.rows.map((r) => r.key)).toEqual(['uc4|ccah:1:10', 'uc4|ccah:1:8']);
    s.split('uc4|ccah:1:8');
    expect(s.rows.map((r) => [r.key, r.pair?.state])).toEqual([['uc4|ccah:1:10', 'joined'], ['uc4|cc:1:8', 'split'], ['uc4|cc:1:40', 'split']]);
    expect(s.rows.find((r) => r.key === 'uc4|cc:1:8')!.pair!.key).toBe('uc4|ccah:1:8');
    s.join('uc4|ccah:1:8');
    expect(s.rows.map((r) => r.pair?.state)).toEqual(['joined', 'joined']);
  });

  it('splits in place: MSB then LSB at the pair\'s place, even when the halves arrived apart; new values and Join keep it', () => {
    const s = live(ccah((se) => { se.encoderGroups[0]!.encoders[2]!.type = 'CCAh'; }));
    send(s, cc(1, 8, 1)); // oldest half
    send(s, cc(1, 10, 2));
    send(s, cc(1, 99, 3));
    send(s, cc(1, 42, 4));
    send(s, cc(1, 40, 5)); // LSB of 8 arrives late: base order is 40, 42, 99, 10, 8
    send(s, cc(1, 98, 6)); // a plain row on top
    const keys = () => s.rows.map((r) => r.key);
    expect(keys()).toEqual(['uc4|cc:1:98', 'uc4|ccah:1:8', 'uc4|ccah:1:10', 'uc4|cc:1:99']);
    const joinedKeys = keys();
    const at8 = joinedKeys.indexOf('uc4|ccah:1:8');
    s.split('uc4|ccah:1:8');
    const split = keys();
    expect(split.indexOf('uc4|cc:1:8')).toBe(at8);
    expect(split.indexOf('uc4|cc:1:40')).toBe(at8 + 1);
    expect(s.rows.slice(at8, at8 + 2).map((r) => [r.pair?.state, r.pair?.role])).toEqual([['split', 'msb'], ['split', 'lsb']]);
    expect(split.filter((k) => k !== 'uc4|cc:1:8' && k !== 'uc4|cc:1:40')).toEqual(joinedKeys.filter((k) => k !== 'uc4|ccah:1:8'));
    send(s, cc(1, 40, 77)); // a new value on a split half does not move it
    expect(keys()).toEqual(split);
    expect(s.rows[at8 + 1]).toMatchObject({ value: 77, lastMoved: true });
    s.join('uc4|ccah:1:8');
    expect(keys()).toEqual(joinedKeys);
    expect(s.rows[at8]).toMatchObject({ value: 1 * 128 + 77, pair: { state: 'joined', role: null } });
  });

  it('lists a split CCAh with only one half as a lone row with its role, at its own place', () => {
    const s = live(ccah());
    send(s, cc(1, 40, 5));
    send(s, cc(1, 99, 1));
    s.split('uc4|ccah:1:8');
    expect(s.rows.map((r) => [r.key, r.pair?.state, r.pair?.role])).toEqual([['uc4|cc:1:99', undefined, undefined], ['uc4|cc:1:40', 'split', 'lsb']]);
  });

  it('splits a note pair in place between other rows', () => {
    const s = live(config());
    send(s, noteOn(0));
    send(s, cc(1, 5, 1));
    send(s, noteOn(1));
    const before = s.rows.map((r) => r.key);
    s.split('uc4|note:1:0');
    const keys = () => s.rows.map((r) => r.key);
    expect(keys()).toEqual(['uc4|note:1:1', 'uc4|cc:1:5', 'uc4|note:1:0#on']);
    send(s, noteOff(0));
    expect(keys()).toEqual(['uc4|note:1:1', 'uc4|cc:1:5', 'uc4|note:1:0#on', 'uc4|note:1:0#off']);
    send(s, noteOn(0, 90));
    expect(keys()).toEqual(['uc4|note:1:1', 'uc4|cc:1:5', 'uc4|note:1:0#on', 'uc4|note:1:0#off']);
    s.join('uc4|note:1:0');
    expect(keys()).toEqual(before);
  });

  it('ignores a split for a pair that is not listed', () => {
    const s = live(ccah());
    s.split('uc4|ccah:1:8');
    expect(s.getState()).toEqual({ splits: [], silenceOffers: false });
  });

  it('feeds the control state from the pair: a CCAh encoder shows its 14-bit position', () => {
    const s = live(ccah());
    send(s, cc(1, 8, 64));
    send(s, cc(1, 40, 0));
    expect([...s.controlStates.values()]).toMatchObject([{ kind: 'absolute', value: 8192 }]);
  });

  it('is pinned as one: the pin holds for the joined row, its halves and the split rows', () => {
    // Two controls (Enc1 in EG1 and in EG2) are CCAh on the same pair.
    const s = live(ccah((se) => { const e = se.encoderGroups[1]!.encoders[0]!; e.type = 'CCAh'; e.number = 8; e.channel = 1; }));
    send(s, cc(1, 8, 1));
    send(s, cc(1, 40, 1));
    const key = s.rows[0]!.key;
    expect(s.rows[0]!.matches.map((m) => m.control.name)).toEqual(['Enc1 · EG1', 'Enc1 · EG2']);
    s.pin(key, s.rows[0]!.matches[1]!.control.id);
    expect(s.rows[0]).toMatchObject({ pinned: true, best: { control: { name: 'Enc1 · EG2' } } });
    s.split(key);
    expect(s.rows.map((r) => r.best?.control.name)).toEqual(['Enc1 · EG2', 'Enc1 · EG2']);
    s.pin(s.rows[0]!.key, null);
    expect(s.rows.map((r) => r.best?.control.name)).toEqual(['Enc1 · EG1', 'Enc1 · EG1']);
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

  it('can be split into the on row and the off row, newest first, each with its own value and count', () => {
    const s = live(config());
    send(s, noteOn(0, 100));
    send(s, noteOff(0));
    send(s, noteOn(0, 90));
    s.split('uc4|note:1:0');
    expect(s.rows.map((r) => [r.key, r.valueText, r.count, r.lastMoved, r.pair?.state])).toEqual([
      ['uc4|note:1:0#on', 'on 90', 2, true, 'split'],
      ['uc4|note:1:0#off', 'off 0', 1, false, 'split'],
    ]);
    expect(s.rows[0]!.best?.control.name).toBe('Pbt1 · EG1');
    send(s, noteOff(0));
    expect(s.rows.map((r) => r.key)).toEqual(['uc4|note:1:0#on', 'uc4|note:1:0#off']); // fixed order: on, then off
    expect(s.rows.map((r) => r.pair?.role)).toEqual(['on', 'off']);
    s.join('uc4|note:1:0');
    expect(s.rows.map((r) => r.valueText)).toEqual(['off 0']);
  });

  it('lists only the half that has been seen, and Clear forgets both', () => {
    const s = live(config());
    send(s, noteOn(0));
    s.split('uc4|note:1:0');
    expect(s.rows.map((r) => r.key)).toEqual(['uc4|note:1:0#on']);
    s.clear();
    send(s, noteOff(0));
    expect(s.rows.map((r) => r.key)).toEqual(['uc4|note:1:0#off']);
  });

  it('also pairs another device\'s notes', () => {
    const s = live(config());
    send(s, noteOn(60), { inputId: 'synth', isUc4: false });
    expect(s.rows[0]).toMatchObject({ pair: { kind: 'note', state: 'joined' }, matches: [] });
  });
});

describe('use as plain functions', () => {
  it('pin, split and join work when taken off the session', () => {
    const s = live(ccah());
    send(s, cc(1, 8, 1));
    send(s, cc(1, 40, 1));
    const { pin, split, join } = s;
    expect(() => { split('uc4|ccah:1:8'); pin('uc4|cc:1:8', null); join('uc4|ccah:1:8'); }).not.toThrow();
    expect(s.rows).toHaveLength(1);
  });

  it('keeps the objects of split note rows between messages that do not touch them', () => {
    const s = live(config());
    send(s, noteOn(0));
    send(s, noteOff(0));
    s.split('uc4|note:1:0');
    send(s, cc(1, 99, 1)); // the note row stops being the last-moved one
    const before = s.rows;
    send(s, cc(1, 99, 2));
    expect(s.rows[1]).toBe(before[1]);
    expect(s.rows[2]).toBe(before[2]);
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
});

describe('session state', () => {
  it('gives the splits as plain data and takes them back after a reload', () => {
    const c = ccah();
    const a = live(c);
    send(a, cc(1, 8, 1));
    send(a, cc(1, 40, 1));
    a.split('uc4|ccah:1:8');
    const saved = JSON.parse(JSON.stringify(a.getState()));
    expect(saved).toEqual({ splits: ['uc4|ccah:1:8'], silenceOffers: false });

    const b = createLiveSession();
    b.restoreState(saved);
    b.setContext(ctx(c));
    send(b, cc(1, 8, 1));
    send(b, cc(1, 40, 1));
    expect(b.rows.map((r) => r.pair?.state)).toEqual(['split', 'split']);
  });

  it('survives Clear, and notifies on a split and a join', () => {
    const s = live(ccah());
    send(s, cc(1, 8, 1));
    send(s, cc(1, 40, 1));
    let n = 0;
    s.subscribe(() => n++);
    s.split('uc4|ccah:1:8');
    s.split('uc4|ccah:1:8');
    s.clear();
    expect(s.getState().splits).toEqual(['uc4|ccah:1:8']);
    s.join('uc4|ccah:1:8');
    s.join('uc4|ccah:1:8');
    expect(n).toBe(3);
  });

  it('takes garbage without throwing', () => {
    const s = createLiveSession();
    for (const bad of [null, undefined, 5, 'x', {}, { splits: 'x' }, { splits: [1, null, 'ok'] }]) expect(() => s.restoreState(bad)).not.toThrow();
    expect(s.getState()).toEqual({ splits: ['ok'], silenceOffers: false });
  });
});
