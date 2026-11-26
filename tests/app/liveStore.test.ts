import { describe, expect, it } from 'vitest';
import { createLive } from '../../src/app/liveStore.svelte.ts';
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
