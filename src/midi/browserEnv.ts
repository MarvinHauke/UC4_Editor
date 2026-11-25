// The real Web MIDI environment for `createDeviceConnection`. Chromium only; needs a secure context (localhost is fine).
import type { MidiAccessLike, MidiEnv, PermissionResult } from './connection.ts';

export function browserMidiEnv(): MidiEnv {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  return {
    supported: typeof nav?.requestMIDIAccess === 'function',
    // Inputs, outputs and plug/unplug are used downstream (`MidiAccessLike`); only `sendDump` writes to an output.
    requestAccess: () => nav!.requestMIDIAccess({ sysex: true }) as unknown as Promise<MidiAccessLike>,
    async queryPermission(): Promise<PermissionResult> {
      try {
        const status = await nav!.permissions.query({ name: 'midi', sysex: true } as unknown as PermissionDescriptor);
        return status.state;
      } catch {
        return 'unsupported'; // the descriptor is not known to this browser
      }
    },
  };
}
