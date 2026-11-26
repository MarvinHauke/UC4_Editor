// Development only (`npm run dev`, open `/?midi=fake`): two fake inputs, "Faderfox UC4" and "Test Synth", and
// `window.fakeMidi` to play them from the console. Never imported in a production build (see midiEnv.ts).
import type { MidiAccessLike, MidiEnv, MidiInputLike } from '../midi/connection.ts';

type Listener = (event: { data: Uint8Array | null }) => void;

class FakeInput implements MidiInputLike {
  onmidimessage: Listener | null = null;
  private listeners = new Set<Listener>();
  constructor(public id: string, public name: string, public state: 'connected' | 'disconnected' = 'connected') {}
  addEventListener(_t: 'midimessage', l: Listener): void { this.listeners.add(l); }
  removeEventListener(_t: 'midimessage', l: Listener): void { this.listeners.delete(l); }
  async open(): Promise<void> { /* nothing to open */ }
  emit(...bytes: number[]): void {
    const event = { data: new Uint8Array(bytes) };
    this.onmidimessage?.(event);
    for (const l of [...this.listeners]) l(event);
  }
}

export interface FakeMidiApi {
  /** `fakeMidi.send('uc4', 0xb1, 74, 64)` plays raw bytes (CC 74 = 64 on channel 2) from 'uc4' or 'synth'. */
  send(from: 'uc4' | 'synth', ...bytes: number[]): void;
  /** `fakeMidi.clock('synth')` sends one MIDI clock byte (F8). */
  clock(from: 'uc4' | 'synth'): void;
  /** Plug or unplug the synth input. */
  plug(synth: boolean): void;
}

export function fakeMidiEnv(): MidiEnv {
  const inputs = new Map<string, FakeInput>([
    ['uc4', new FakeInput('uc4', 'Faderfox UC4')],
    ['synth', new FakeInput('synth', 'Test Synth')],
  ]);
  const views: MidiAccessLike[] = [];
  const notify = (): void => { for (const v of views) v.onstatechange?.(); };
  const api: FakeMidiApi = {
    send: (from, ...bytes) => { inputs.get(from)?.emit(...bytes); },
    clock: (from) => { inputs.get(from)?.emit(0xf8); },
    plug: (synth) => {
      const i = inputs.get('synth');
      if (i) { i.state = synth ? 'connected' : 'disconnected'; notify(); }
    },
  };
  (window as unknown as { fakeMidi: FakeMidiApi }).fakeMidi = api;
  return {
    supported: true,
    queryPermission: async () => 'granted',
    requestAccess: async () => {
      const view: MidiAccessLike = { inputs: { values: () => inputs.values() }, outputs: { values: () => [] }, onstatechange: null };
      views.push(view);
      return view;
    },
  };
}
