import { describe, expect, it } from 'vitest';
import { createLiveSession, controlId, type ChannelMessage, type LiveContext, type LiveSession } from '../../src/live/index.ts';
import { factorySetup } from '../../src/model/factory.ts';
import type { Setup, Uc4Config } from '../../src/model/types.ts';

let t = 0;
const send = (s: LiveSession, message: ChannelMessage, o: { inputId?: string; isUc4?: boolean } = {}) =>
  s.receive({ message, inputId: o.inputId ?? 'uc4', isUc4: o.isUc4 ?? true, at: ++t });
const cc = (channel: number, number: number, value: number): ChannelMessage => ({ kind: 'cc', channel, number, value });
const noteOn = (channel: number, number: number, value = 127): ChannelMessage => ({ kind: 'note', channel, number, value, on: true });
const noteOff = (channel: number, number: number): ChannelMessage => ({ kind: 'note', channel, number, value: 0, on: false });

function config(...setups: Setup[]): Uc4Config {
  return { format: 'uc4-config', schemaVersion: 1, device: { profile: 'faderfox-uc4' }, createdAt: '', updatedAt: '', setups };
}
/** SE01 (channel 1) as the open setup, a copy of it as another setup, and SE02 (channel 2). */
function twoSetups(edit?: (se01: Setup) => void): Uc4Config {
  const a = factorySetup(1);
  edit?.(a);
  const copy = { ...structuredClone(factorySetup(1)), id: 'copy', name: 'Copy', slot: undefined };
  return config(a, copy);
}
const ctx = (configuration: Uc4Config, o: Partial<LiveContext> = {}): LiveContext =>
  ({ configuration, setupId: 'factory-se01', encoderGroup: 0, faderButtonGroup: 0, ...o });
const live = (c: Uc4Config, o: Partial<LiveContext> = {}) => { const s = createLiveSession(); s.setContext(ctx(c, o)); return s; };
const enc = (setupId: string, group: number, index: number) => controlId(setupId, 'encoders', group, index);
const push = (setupId: string, group: number, index: number) => controlId(setupId, 'pushButtons', group, index);
const fad = (setupId: string, group: number, index: number) => controlId(setupId, 'faders', group, index);
const btn = (setupId: string, group: number, index: number) => controlId(setupId, 'buttons', group, index);

describe('matches', () => {
  it('names the control a UC4 message belongs to, in the device vocabulary', () => {
    const s = live(twoSetups(), { setupId: 'factory-se01' });
    send(s, cc(1, 8, 100)); // Enc1 · EG1 (factory SE01)
    const row = s.rows[0]!;
    expect(row.best).toMatchObject({ tier: 1, via: 'message', control: { name: 'Enc1 · EG1', setupId: 'factory-se01', slot: 1, area: 'encoders', group: 0, index: 0 } });
    expect(row.matches.map((m) => m.control.setupId)).toEqual(['factory-se01', 'copy']);
  });

  it('names the other control kinds', () => {
    const s = live(twoSetups());
    send(s, noteOn(1, 0)); // Pbt1 · EG1
    send(s, cc(1, 112, 5)); // FAd9 · FG1
    send(s, noteOn(1, 64)); // btn1 · FG1
    expect(s.rows.map((r) => r.best?.control.name)).toEqual(['btn1 · FG1', 'FAd9 · FG1', 'Pbt1 · EG1']);
  });

  it('matches nothing without a context, nothing for another device, and nothing for a message no control sends', () => {
    const none = createLiveSession();
    send(none, cc(1, 8, 1));
    expect(none.rows[0]).toMatchObject({ matches: [], best: null, more: 0, pinned: false });
    const s = live(twoSetups());
    send(s, cc(1, 8, 1), { inputId: 'synth', isUc4: false });
    send(s, cc(9, 99, 1));
    expect(s.rows.map((r) => r.matches)).toEqual([[], []]);
  });

  it('ranks in three tiers: the two open groups, the setup\'s other groups, other setups', () => {
    // factory SE01: Enc1 · EG4 and FAd1 · FG1 both send CC 32 ch 1.
    const c = twoSetups();
    const s = live(c, { encoderGroup: 0, faderButtonGroup: 0 });
    send(s, cc(1, 32, 1));
    expect(s.rows[0]!.matches.map((m) => [m.control.name, m.control.setupId, m.tier])).toEqual([
      ['FAd1 · FG1', 'factory-se01', 1], ['Enc1 · EG4', 'factory-se01', 2], ['Enc1 · EG4', 'copy', 3], ['FAd1 · FG1', 'copy', 3],
    ]);
    expect(s.rows[0]).toMatchObject({ more: 3 });
    s.setContext(ctx(c, { encoderGroup: 3, faderButtonGroup: 0 }));
    expect(s.rows[0]!.matches.slice(0, 2).map((m) => [m.control.name, m.tier])).toEqual([['Enc1 · EG4', 1], ['FAd1 · FG1', 1]]);
    s.setContext(ctx(c, { encoderGroup: 0, faderButtonGroup: 5 }));
    expect(s.rows[0]!.matches.map((m) => m.tier)).toEqual([2, 2, 3, 3]);
    s.setContext(ctx(c, { setupId: 'copy', encoderGroup: 0, faderButtonGroup: 0 }));
    expect(s.rows[0]!.best).toMatchObject({ tier: 1, control: { setupId: 'copy', name: 'FAd1 · FG1' } });
  });

  it('re-ranks every row when the group selection changes', () => {
    const c = twoSetups();
    const s = live(c, { encoderGroup: 3, faderButtonGroup: 4 });
    send(s, cc(1, 8, 1)); // Enc1 · EG1: a tier 2 match while EG4 is shown
    expect(s.rows[0]!.best!.tier).toBe(2);
    s.setContext(ctx(c, { encoderGroup: 0 }));
    expect(s.rows[0]!.best!.tier).toBe(1);
  });

  it('matches program change, pitch bend and aftertouch, and OFF never', () => {
    const c = twoSetups((se) => {
      se.encoderGroups[0]!.encoders[0]!.type = 'PrGC';
      se.encoderGroups[0]!.encoders[1]!.type = 'Pbnd'; se.encoderGroups[0]!.encoders[1]!.channel = 5;
      se.encoderGroups[0]!.encoders[2]!.type = 'AFtt'; se.encoderGroups[0]!.encoders[2]!.channel = 6;
      se.encoderGroups[0]!.pushButtons[0]!.type = 'OFF';
    });
    const s = live(c);
    send(s, { kind: 'program', channel: 1, number: 33, value: 0 });
    send(s, { kind: 'pitchBend', channel: 5, number: null, value: 8192 });
    send(s, { kind: 'aftertouch', channel: 6, number: null, value: 9 });
    send(s, noteOn(1, 0)); // Pbt1 is OFF now: only the untouched copy setup still sends note 0 ch 1
    expect(s.rows.map((r) => [r.best?.control.name, r.best?.tier])).toEqual([['Pbt1 · EG1', 3], ['Enc3 · EG1', 1], ['Enc2 · EG1', 1], ['Enc1 · EG1', 1]]);
    expect(s.rows[0]!.best!.control.setupId).toBe('copy');
  });

  it('matches a program change by its program: a button\'s upper value, an encoder\'s or fader\'s range', () => {
    const c = twoSetups((se) => {
      const b = se.faderButtonGroups[0]!.buttons;
      b[0]!.type = 'PrGC'; b[0]!.channel = 3; b[0]!.lower = 9; b[0]!.upper = 4;
      b[1]!.type = 'PrGC'; b[1]!.channel = 3; b[1]!.lower = 5; b[1]!.upper = 5;
      const f = se.faderButtonGroups[0]!.faders[0]!;
      f.type = 'PrGC'; f.channel = 3; f.lower = 10; f.upper = 20;
    });
    const s = live(c);
    for (const n of [4, 5, 15, 21, 9]) send(s, { kind: 'program', channel: 3, number: n, value: 0 });
    const names = (n: number) => s.rows.find((r) => r.number === n)!.matches.filter((m) => m.control.setupId === 'factory-se01').map((m) => m.control.name);
    expect([4, 5, 9, 15, 21].map(names)).toEqual([['btn1 · FG1'], ['btn2 · FG1'], [], ['FAd1 · FG1'], []]);
  });

  it('a lone CC n or n+32 matches its CCAh control, as msb or lsb', () => {
    const c = twoSetups((se) => { const e = se.encoderGroups[0]!.encoders[0]!; e.type = 'CCAh'; e.number = 8; });
    const s = live(c);
    send(s, cc(1, 8, 1));
    expect(s.rows.map((r) => [r.best?.control.name, r.best?.via])).toEqual([['Enc1 · EG1', 'msb']]);
    send(s, cc(1, 40, 1)); // the other half arrives: one joined row (tests/live/pairs.test.ts)
    expect(s.rows.map((r) => [r.best?.control.name, r.best?.via, r.pair?.state])).toEqual([['Enc1 · EG1', 'msb', 'joined']]);
    const lsbFirst = live(c);
    send(lsbFirst, cc(1, 40, 1));
    expect(lsbFirst.rows.map((r) => [r.best?.control.name, r.best?.via, r.pair?.state])).toEqual([['Enc1 · EG1', 'lsb', 'waiting']]);
  });
});

describe('pins', () => {
  const setup = () => {
    const c = twoSetups();
    const s = live(c, { encoderGroup: 0, faderButtonGroup: 0 });
    send(s, cc(1, 32, 1));
    return { c, s, key: s.rows[0]!.key };
  };

  it('keeps the row object of a row that did not change, and renews it when a pin or the context changes', () => {
    const { c, s, key } = setup();
    send(s, cc(1, 9, 1));
    const other = s.rows.find((r) => r.key !== key)!;
    const pinnedRow = s.rows.find((r) => r.key === key)!;
    send(s, cc(1, 9, 2));
    expect(s.rows.find((r) => r.key === key)).toBe(pinnedRow);
    s.pin(key, enc('factory-se01', 3, 0));
    expect(s.rows.find((r) => r.key === key)).not.toBe(pinnedRow);
    s.setContext(ctx(c));
    expect(s.rows.find((r) => r.key === other.key)).not.toBe(other);
  });

  it('puts the pinned match first and says so; unpinning restores the ranking', () => {
    const { s, key } = setup();
    s.pin(key, enc('factory-se01', 3, 0));
    expect(s.rows[0]).toMatchObject({ pinned: true, best: { control: { name: 'Enc1 · EG4' } }, more: 3 });
    s.pin(key, null);
    expect(s.rows[0]).toMatchObject({ pinned: false, best: { control: { name: 'FAd1 · FG1' } } });
  });

  it('holds across group changes and new values, and lapses when the open setup changes', () => {
    const { c, s, key } = setup();
    s.pin(key, enc('factory-se01', 3, 0));
    s.setContext(ctx(c, { encoderGroup: 5, faderButtonGroup: 2 }));
    send(s, cc(1, 32, 9));
    expect(s.rows[0]!.best!.control.id).toBe(enc('factory-se01', 3, 0));
    s.setContext(ctx(c, { setupId: 'copy' }));
    expect(s.rows[0]!.pinned).toBe(false);
    s.setContext(ctx(c, { setupId: 'factory-se01' }));
    expect(s.rows[0]!.pinned).toBe(false);
  });

  it('ignores a pin that is not a match of the row, or on another device\'s row', () => {
    const { s, key } = setup();
    s.pin(key, enc('factory-se01', 0, 0));
    s.pin('nope', fad('factory-se01', 0, 0));
    send(s, cc(1, 32, 1), { inputId: 'synth', isUc4: false });
    s.pin(s.rows[0]!.key, fad('factory-se01', 0, 0));
    expect(s.rows.find((r) => r.key === key)).toMatchObject({ pinned: false, best: { control: { name: 'FAd1 · FG1' } } });
    expect(s.rows[0]).toMatchObject({ pinned: false, matches: [] });
  });

  it('drops a pin when the control is edited to send something else', () => {
    const { c, s, key } = setup();
    s.pin(key, enc('factory-se01', 3, 0));
    const edited = structuredClone(c);
    edited.setups[0]!.encoderGroups[3]!.encoders[0]!.number = 99;
    s.setContext(ctx(edited));
    expect(s.rows.find((r) => r.key === key)).toMatchObject({ pinned: false });
  });
});

describe('control states', () => {
  it('are unknown until the control first sends', () => {
    const s = live(twoSetups());
    expect(s.controlStates.size).toBe(0);
    expect(s.lastTouched).toBeNull();
  });

  it('follow a fader: raw value and its place between lower and upper', () => {
    const s = live(twoSetups());
    send(s, cc(1, 112, 127));
    expect(s.controlStates.get(fad('factory-se01', 0, 8))).toMatchObject({ kind: 'absolute', value: 127, fraction: 1 });
    send(s, cc(1, 112, 0));
    expect(s.controlStates.get(fad('factory-se01', 0, 8))).toMatchObject({ value: 0, fraction: 0 });
    expect(s.lastTouched?.control.name).toBe('FAd9 · FG1');
  });

  it('honour an inverted range (lower > upper) and a degenerate one', () => {
    const c = twoSetups((se) => { se.faderButtonGroups[0]!.faders[0]!.lower = 127; se.faderButtonGroups[0]!.faders[0]!.upper = 0; se.faderButtonGroups[0]!.faders[1]!.lower = 5; se.faderButtonGroups[0]!.faders[1]!.upper = 5; });
    const s = live(c);
    send(s, cc(1, 32, 127));
    send(s, cc(1, 33, 5));
    expect(s.controlStates.get(fad('factory-se01', 0, 0))).toMatchObject({ fraction: 0 });
    expect(s.controlStates.get(fad('factory-se01', 0, 1))).toMatchObject({ fraction: null });
  });

  it('go to the best match only, not to every control that sends the message', () => {
    const s = live(twoSetups(), { encoderGroup: 0, faderButtonGroup: 0 });
    send(s, cc(1, 32, 64)); // FAd1 · FG1 (tier 1) rather than Enc1 · EG4
    expect([...s.controlStates.keys()]).toEqual([fad('factory-se01', 0, 0)]);
  });

  it('count relative ticks: CCr1 1/127, CCr2 65/63', () => {
    const c = twoSetups((se) => { se.encoderGroups[0]!.encoders[0]!.type = 'CCr1'; se.encoderGroups[0]!.encoders[1]!.type = 'CCr2'; });
    const s = live(c);
    for (const v of [1, 1, 127]) send(s, cc(1, 8, v));
    for (const v of [65, 63, 63]) send(s, cc(1, 9, v));
    expect(s.controlStates.get(enc('factory-se01', 0, 0))).toMatchObject({ kind: 'relative', delta: -1, total: 1 });
    expect(s.controlStates.get(enc('factory-se01', 0, 1))).toMatchObject({ kind: 'relative', delta: -1, total: -1 });
  });

  it('follow a notE button: on at note-on, off at the note-off; toGL the same, one message per press', () => {
    const c = twoSetups((se) => { se.faderButtonGroups[0]!.buttons[7]!.mode = 'toGL'; });
    const s = live(c);
    send(s, noteOn(1, 0));
    expect(s.controlStates.get(push('factory-se01', 0, 0))).toMatchObject({ kind: 'button', on: true });
    send(s, noteOff(1, 0));
    expect(s.controlStates.get(push('factory-se01', 0, 0))).toMatchObject({ on: false });
    send(s, noteOn(1, 71));
    expect(s.controlStates.get(btn('factory-se01', 0, 7))).toMatchObject({ on: true });
    send(s, noteOff(1, 71));
    expect(s.controlStates.get(btn('factory-se01', 0, 7))).toMatchObject({ on: false });
  });

  it('follow a CC button by its upper and lower value', () => {
    const c = twoSetups((se) => { const b = se.faderButtonGroups[0]!.buttons[0]!; b.type = 'CC'; b.number = 100; b.lower = 5; b.upper = 100; });
    const s = live(c);
    send(s, cc(1, 100, 100));
    expect(s.controlStates.get(btn('factory-se01', 0, 0))).toMatchObject({ kind: 'button', on: true });
    send(s, cc(1, 100, 5));
    expect(s.controlStates.get(btn('factory-se01', 0, 0))).toMatchObject({ on: false });
  });

  it('count presses of a PrGC button, and read a PrGC fader\'s program as its value', () => {
    const c = twoSetups((se) => { se.encoderGroups[0]!.pushButtons[0]!.type = 'PrGC'; se.encoderGroups[0]!.pushButtons[0]!.upper = 7; se.faderButtonGroups[0]!.faders[0]!.type = 'PrGC'; se.faderButtonGroups[0]!.faders[0]!.channel = 2; });
    const s = live(c);
    send(s, { kind: 'program', channel: 1, number: 7, value: 0 });
    send(s, { kind: 'program', channel: 1, number: 7, value: 0 });
    send(s, { kind: 'program', channel: 2, number: 64, value: 0 });
    expect(s.controlStates.get(push('factory-se01', 0, 0))).toMatchObject({ kind: 'trigger', count: 2, value: 7 });
    expect(s.controlStates.get(fad('factory-se01', 0, 0))).toMatchObject({ kind: 'absolute', value: 64 });
  });

  it('read pitch bend over 14 bits', () => {
    const c = twoSetups((se) => { const f = se.faderButtonGroups[0]!.faders[0]!; f.type = 'Pbnd'; f.channel = 3; });
    const s = live(c);
    send(s, { kind: 'pitchBend', channel: 3, number: null, value: 16383 });
    expect(s.controlStates.get(fad('factory-se01', 0, 0))).toMatchObject({ value: 16383, fraction: 1 });
  });

  it('show a CCAh encoder once both halves arrived, never from one half', () => {
    const c = twoSetups((se) => { const e = se.encoderGroups[0]!.encoders[0]!; e.type = 'CCAh'; e.number = 8; });
    const s = live(c);
    send(s, cc(1, 8, 1));
    expect(s.controlStates.has(enc('factory-se01', 0, 0))).toBe(false);
    send(s, cc(1, 40, 5));
    expect(s.controlStates.get(enc('factory-se01', 0, 0))).toMatchObject({ kind: 'absolute', value: 133 });
  });

  it('ignore other devices\' messages', () => {
    const s = live(twoSetups());
    send(s, cc(1, 112, 9), { inputId: 'synth', isUc4: false });
    expect(s.controlStates.size).toBe(0);
    expect(s.lastTouched).toBeNull();
  });

  it('survive Clear, and drop when the control is edited or gone', () => {
    const c = twoSetups();
    const s = live(c);
    send(s, cc(1, 112, 64));
    s.clear();
    expect(s.controlStates.size).toBe(1);
    const same = structuredClone(c);
    same.setups[0]!.faderButtonGroups[0]!.faders[8]!.display = 'OFF'; // not part of what it sends
    s.setContext(ctx(same));
    expect(s.controlStates.size).toBe(1);
    const edited = structuredClone(c);
    edited.setups[0]!.faderButtonGroups[0]!.faders[8]!.number = 100;
    s.setContext(ctx(edited));
    expect(s.controlStates.size).toBe(0);
    expect(s.lastTouched).not.toBeNull(); // the control still exists
    s.setContext(null);
    expect(s.controlStates.size).toBe(0);
    expect(s.lastTouched).toBeNull();
  });

  it('a new map after every change, so a held snapshot stays as it was', () => {
    const s = live(twoSetups());
    send(s, cc(1, 112, 1));
    const before = s.controlStates;
    send(s, cc(1, 112, 2));
    expect(s.controlStates).not.toBe(before);
    expect(before.get(fad('factory-se01', 0, 8))).toMatchObject({ value: 1 });
  });
});

describe('PrGC out of range', () => {
  it('clamps an imported lower/upper to 0–127 instead of building a key per program', () => {
    const c = twoSetups((se) => { const e = se.encoderGroups[0]!.encoders[0]!; e.type = 'PrGC'; e.channel = 1; e.lower = -5; e.upper = 100000000; });
    const s = live(c);
    send(s, { kind: 'program', channel: 1, number: 127, value: 0 });
    expect(s.rows[0]!.matches.some((m) => m.control.id === enc('factory-se01', 0, 0))).toBe(true);
  });
});
