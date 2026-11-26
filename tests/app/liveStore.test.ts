import { describe, expect, it } from 'vitest';
import { SESSION_STATE_KEY } from '../../src/app/liveSessionState.ts';
import { createLive } from '../../src/app/liveStore.svelte.ts';
import { factorySetup } from '../../src/model/index.ts';
import { createLiveSession, type LiveContext } from '../../src/live/index.ts';
import { createMidiInputs } from '../../src/midi/inputs.ts';
import { FakeInput, fakeEnv } from '../midi/fakeMidi.ts';

const memory = (m = new Map<string, string>()) => ({ m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } });

function setup(storage = memory()) {
  const f = fakeEnv();
  const uc4 = new FakeInput('u', 'Faderfox UC4');
  const synth = new FakeInput('s', 'Synth');
  f.access.inputs.set('u', uc4); f.access.inputs.set('s', synth);
  const live = createLive(createMidiInputs({ portName: 'Faderfox UC4', env: f.env }), undefined, storage);
  return { live, uc4, synth };
}

describe('live store', () => {
  it('lists messages as rows once connected, one row per key and source, UC4 marked', async () => {
    const { live, uc4, synth } = setup();
    await live.connect();
    uc4.emit(0xb1, 74, 10); uc4.emit(0xb1, 74, 20); synth.emit(0xb1, 74, 5);
    expect(live.rows.map((r) => [r.inputId, r.value, r.isUc4])).toEqual([['s', 5, false], ['u', 20, true]]);
    live.clear();
    expect(live.rows).toEqual([]);
  });
  it('remembers the chosen input and applies it on load', async () => {
    const storage = memory();
    const first = setup(storage);
    await first.live.connect();
    first.live.select('s');
    const second = setup(storage);
    await second.live.connect();
    expect(second.live.selection).toBe('s');
    second.uc4.emit(0xb1, 1, 1);
    expect(second.live.rows).toEqual([]);
  });
  it('notes that MIDI clock is ignored', async () => {
    const { live, uc4 } = setup();
    await live.connect();
    expect(live.clockIgnored).toBe(false);
    uc4.emit(0xf8);
    expect(live.clockIgnored).toBe(true);
  });
});

describe('live context', () => {
  it('reaches the session only when the setup, a group selection or the configuration changes', () => {
    const f = fakeEnv();
    const session = createLiveSession();
    const sent: unknown[] = [];
    const real = session.setContext.bind(session);
    session.setContext = (c) => { sent.push(c); real(c); };
    const live = createLive(createMidiInputs({ portName: 'Faderfox UC4', env: f.env }), session, memory());
    const configuration = { setups: [] } as unknown as LiveContext['configuration'];
    const ctx = (over: Partial<LiveContext> = {}): LiveContext => ({ configuration, setupId: 's1', encoderGroup: 0, faderButtonGroup: 0, ...over });
    live.setContext(ctx());
    live.setContext(ctx()); // a control selected, a save status flipped: same four inputs
    live.setContext(ctx());
    expect(sent).toHaveLength(1);
    live.setContext(ctx({ encoderGroup: 2 }));
    live.setContext(ctx({ encoderGroup: 2, faderButtonGroup: 1 }));
    live.setContext(ctx({ encoderGroup: 2, faderButtonGroup: 1, setupId: 's2' }));
    live.setContext(ctx({ encoderGroup: 2, faderButtonGroup: 1, setupId: 's2', configuration: { setups: [] } as unknown as LiveContext['configuration'] }));
    expect(sent).toHaveLength(5);
    live.setContext(null);
    live.setContext(null);
    expect(sent).toHaveLength(6);
  });
});

describe('session state', () => {
  it('saves a split and restores it in a new store of the same tab', async () => {
    const tab = memory();
    const f1 = fakeEnv();
    const u1 = new FakeInput('u', 'Faderfox UC4'); f1.access.inputs.set('u', u1);
    const a = createLive(createMidiInputs({ portName: 'Faderfox UC4', env: f1.env }), undefined, memory(), tab);
    await a.connect();
    u1.emit(0x91, 60, 100); u1.emit(0x81, 60, 0);
    expect(a.rows).toHaveLength(1);
    a.split(a.rows[0]!.pair!.key);
    expect(a.rows).toHaveLength(2);
    expect(tab.m.get(SESSION_STATE_KEY)).toContain('splits');
    const f2 = fakeEnv();
    const u2 = new FakeInput('u', 'Faderfox UC4'); f2.access.inputs.set('u', u2);
    const b = createLive(createMidiInputs({ portName: 'Faderfox UC4', env: f2.env }), undefined, memory(), tab);
    await b.connect();
    u2.emit(0x91, 60, 100); u2.emit(0x81, 60, 0);
    expect(b.rows).toHaveLength(2);
    expect(createLive(createMidiInputs({ portName: 'x', env: fakeEnv().env }), undefined, memory(), memory()).rows).toEqual([]);
  });
});

describe('switch offer', () => {
  const config = { format: 'uc4-config', schemaVersion: 1, device: { profile: 'faderfox-uc4' }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', setups: [factorySetup(1)] } as unknown as LiveContext['configuration'];
  const open = async () => {
    const f = fakeEnv();
    const uc4 = new FakeInput('u', 'Faderfox UC4'); f.access.inputs.set('u', uc4);
    const live = createLive(createMidiInputs({ portName: 'Faderfox UC4', env: f.env }), undefined, memory(), memory());
    await live.connect();
    live.setContext({ configuration: config, setupId: factorySetup(1).id, encoderGroup: 0, faderButtonGroup: 0 });
    return { live, uc4 };
  };
  it('is offered after three messages of another encoder group, and accepting gives the target once', async () => {
    const { live, uc4 } = await open();
    uc4.emit(0xb0, 24, 1); uc4.emit(0xb0, 25, 1);
    expect(live.offer).toBeNull();
    uc4.emit(0xb0, 26, 1);
    expect(live.offer?.text).toContain('encoder group 3');
    const target = live.acceptOffer()?.target;
    expect(target?.encoderGroup).toBe(2);
    expect(live.offer).toBeNull();
    expect(live.acceptOffer()).toBeNull();
  });
  it('"No" holds, and with the box it stops all offers and is remembered as silenced', async () => {
    const { live, uc4 } = await open();
    for (const n of [24, 25, 26]) uc4.emit(0xb0, n, 1);
    live.declineOffer(true);
    expect(live.offer).toBeNull();
    expect(live.silenced).toBe(true);
    for (const n of [32, 33, 34]) uc4.emit(0xb0, n, 1);
    expect(live.offer).toBeNull();
  });
});
