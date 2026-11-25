// A fake Web MIDI environment for the device connection tests: ports come and go, SysEx arrives.
import type { MidiAccessLike, MidiEnv, MidiInputLike, MidiOutputLike, PermissionResult } from '../../src/midi/connection.ts';

export class FakeInput implements MidiInputLike {
  onmidimessage: ((event: { data: Uint8Array | null }) => void) | null = null;
  constructor(public id: string, public name: string | null, public state: 'connected' | 'disconnected' = 'connected') {}
  emit(...bytes: number[]) { this.onmidimessage?.({ data: new Uint8Array(bytes) }); }
}

export class FakeAccess implements MidiAccessLike {
  inputs = new Map<string, FakeInput>();
  onstatechange: (() => void) | null = null;
  /** Everything written to any output. */
  sent: Uint8Array[] = [];
  outputs = new Map<string, MidiOutputLike>([
    ['out1', { id: 'out1', name: 'Faderfox UC4', state: 'connected', send: (d) => { this.sent.push(d); } }],
  ]);
  plug(input: FakeInput) { this.inputs.set(input.id, input); this.onstatechange?.(); }
  unplug(id: string) { this.inputs.delete(id); this.onstatechange?.(); }
}

export function fakeEnv(opts: { access?: FakeAccess; permission?: PermissionResult; denyWith?: string; supported?: boolean } = {}) {
  const access = opts.access ?? new FakeAccess();
  const calls = { requests: 0 };
  const env: MidiEnv = {
    supported: opts.supported ?? true,
    async requestAccess() {
      calls.requests++;
      if (opts.denyWith) { const e = new Error('denied'); e.name = opts.denyWith; throw e; }
      return access;
    },
    async queryPermission() { return opts.permission ?? 'unsupported'; },
  };
  return { env, access, calls };
}
