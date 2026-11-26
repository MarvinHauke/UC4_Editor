// A fake Web MIDI environment for the device connection tests: ports come and go, SysEx arrives.
import type { MidiAccessLike, MidiEnv, MidiInputLike, MidiOutputLike, PermissionResult } from '../../src/midi/connection.ts';

export class FakeInput implements MidiInputLike {
  onmidimessage: ((event: { data: Uint8Array | null }) => void) | null = null;
  /** How often `open()` was called (the browser opens a port that is only listened to with addEventListener). */
  opened = 0;
  private listeners = new Set<(event: { data: Uint8Array | null }) => void>();
  constructor(public id: string, public name: string | null, public state: 'connected' | 'disconnected' = 'connected') {}
  addEventListener(_type: 'midimessage', l: (event: { data: Uint8Array | null }) => void) { this.listeners.add(l); }
  removeEventListener(_type: 'midimessage', l: (event: { data: Uint8Array | null }) => void) { this.listeners.delete(l); }
  async open() { this.opened++; }
  get listenerCount() { return this.listeners.size; }
  emit(...bytes: number[]) { this.emitData(new Uint8Array(bytes)); }
  emitData(data: Uint8Array | null) {
    const event = { data };
    this.onmidimessage?.(event);
    for (const l of [...this.listeners]) l(event);
  }
}

export class FakeAccess implements MidiAccessLike {
  inputs = new Map<string, FakeInput>();
  onstatechange: (() => void) | null = null;
  /** Everything written to any output. */
  sent: Uint8Array[] = [];
  outputs = new Map<string, MidiOutputLike>([
    ['out1', { id: 'out1', name: 'Faderfox UC4', state: 'connected', send: (d) => { this.sent.push(d); } }],
  ]);
  /** Like the browser: every `requestAccess()` gives an access of its own (own `onstatechange`) over the same ports. */
  views: FakeAccess[] = [];
  fork(): FakeAccess {
    const view = new FakeAccess();
    view.inputs = this.inputs;
    view.outputs = this.outputs;
    view.sent = this.sent;
    this.views.push(view);
    return view;
  }
  private notify() { this.onstatechange?.(); for (const v of this.views) v.onstatechange?.(); }
  plug(input: FakeInput) { this.inputs.set(input.id, input); this.notify(); }
  unplug(id: string) { this.inputs.delete(id); this.notify(); }
}

export function fakeEnv(opts: { access?: FakeAccess; permission?: PermissionResult; denyWith?: string; supported?: boolean } = {}) {
  const access = opts.access ?? new FakeAccess();
  const calls = { requests: 0 };
  const env: MidiEnv = {
    supported: opts.supported ?? true,
    async requestAccess() {
      calls.requests++;
      if (opts.denyWith) { const e = new Error('denied'); e.name = opts.denyWith; throw e; }
      return access.fork();
    },
    async queryPermission() { return opts.permission ?? 'unsupported'; },
  };
  return { env, access, calls };
}
