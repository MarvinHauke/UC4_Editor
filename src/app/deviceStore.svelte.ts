// The device connection as Svelte state (plan 0005 step 3): the chip and its panel read `state` and call commands.
// It listens; the only way out is `sendDump`, called from the Send dialog's Send button (CLAUDE.md, "Hardware safety").
import type { ConnectionState, DeviceConnection, SendResult, SysexMessage } from '../midi/connection.ts';

export function createDevice(connection: DeviceConnection) {
  let state = $state.raw<ConnectionState>(connection.state);
  const stop = connection.subscribe((s) => { state = s; });
  return {
    get state() { return state; },
    get connected() { return state.kind === 'connected'; },
    /** On the user's click: asks the browser for MIDI access. */
    connect: () => connection.connect(),
    /** On page load: only if the permission is already given; never prompts. */
    reconnect: () => connection.reconnect(),
    /** Every complete SysEx message from the UC4 input, as long as the connection listens. Returns the unsubscribe function. */
    onSysex: (fn: (message: SysexMessage) => void) => connection.onSysex(fn),
    /** When this connection was made (ms since the epoch), or null: a re-plug or another port is a new one. */
    get connectedAt() { return connection.connectedAt; },
    /** Only from the Send dialog's Send button, with the bytes of `planSend`. */
    sendDump: (bytes: Uint8Array): SendResult => connection.sendDump(bytes),
    choosePort: (id: string) => { connection.choosePort(id); },
    dispose(): void { stop(); connection.dispose(); },
  };
}
export type Device = ReturnType<typeof createDevice>;

/** The chip's words (UX checklist 13: one name per thing): `UC4: connected`, `UC4: not connected`. */
export function chipText(deviceName: string, state: ConnectionState): string {
  return `${deviceName}: ${state.kind === 'connected' ? 'connected' : 'not connected'}`;
}
