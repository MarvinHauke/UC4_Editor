// The device connection (plan 0005, steps 3 and 12): Web MIDI access to the one device the profile names.
// It listens; the only way out is `sendDump`, called on an explicit user action (CLAUDE.md, "Hardware safety").
// Nothing here sends on load, on connect or on reconnect.
// This module knows nothing of the UI or of one device: the port name and the area guard (`checkSendable`, from the
// protocol engine) are handed in, bytes are handed out. Bytes outside the device's write areas are refused before `send`.

/** The part of a Web MIDI input this module uses. */
export interface MidiInputLike {
  id: string;
  name: string | null;
  state: 'connected' | 'disconnected';
  onmidimessage: ((event: { data: Uint8Array | null }) => void) | null;
}

/** The part of a Web MIDI output this module uses: `sendDump` is the only caller of `send`. */
export interface MidiOutputLike {
  id: string;
  name: string | null;
  state: 'connected' | 'disconnected';
  send(data: Uint8Array): void;
}

/** The part of `MIDIAccess` this module uses: the inputs, the outputs and plug/unplug. */
export interface MidiAccessLike {
  inputs: { values(): Iterable<MidiInputLike> };
  outputs: { values(): Iterable<MidiOutputLike> };
  onstatechange: (() => void) | null;
}

export type PermissionResult = 'granted' | 'denied' | 'prompt' | 'unsupported';

/** What the browser offers; injected so tests use a fake (`browserMidiEnv` is the real one). */
export interface MidiEnv {
  /** False in a browser without `requestMIDIAccess`. */
  supported: boolean;
  /** `requestMIDIAccess({ sysex: true })`; may prompt the user. Rejects with the browser's error. */
  requestAccess(): Promise<MidiAccessLike>;
  /** The stored permission for MIDI with SysEx, without prompting; `unsupported` where the browser can't say. */
  queryPermission(): Promise<PermissionResult>;
}

export interface PortInfo { id: string; name: string }

export type ConnectionState =
  | { kind: 'unsupported'; message: string }
  | { kind: 'denied'; message: string }
  /** `access` is true once the browser granted MIDI access but no matching port is there (the message says what to do). */
  | { kind: 'not-connected'; access: boolean; message: string }
  | { kind: 'choose-port'; candidates: PortInfo[] }
  | { kind: 'connected'; port: PortInfo };

export interface SysexMessage {
  /** The whole message, `0xF0 … 0xF7`. */
  bytes: Uint8Array;
  /** Arrival time in ms since the epoch. */
  receivedAt: number;
}

/** The answer of `sendDump`; a refusal says why and what to do. Nothing was sent when `ok` is false. */
export type SendResult =
  | { ok: true; bytes: number }
  | { ok: false; reason: 'not-connected' | 'no-output' | 'invalid-bytes' | 'refused' | 'send-failed'; message: string };

/** True when `bytes` is one or more complete SysEx messages (`F0 … F7`, data bytes 0–127 between) and nothing else. */
export function isCompleteSysex(bytes: Uint8Array): boolean {
  if (bytes.length < 2) return false;
  let open = false;
  for (const b of bytes) {
    if (b === 0xf0) { if (open) return false; open = true; }
    else if (b === 0xf7) { if (!open) return false; open = false; }
    else if (!open || b >= 0x80) return false;
  }
  return !open;
}

export interface DeviceConnection {
  readonly state: ConnectionState;
  /** When the current connection to the UC4 was made (ms since the epoch); null when not connected. A re-plug or another port starts a new one. */
  readonly connectedAt: number | null;
  /** On the user's click: asks for MIDI access (the browser prompts the first time). Never throws. */
  connect(): Promise<void>;
  /** On page load: connects only if the permission is already granted; never prompts. Never throws. */
  reconnect(): Promise<void>;
  /** With several matching ports: pick one by its id. */
  choosePort(id: string): void;
  /** Called with every state change (not at subscription). Returns the unsubscribe function. */
  subscribe(listener: (state: ConnectionState) => void): () => void;
  /** Called with every complete SysEx message from the UC4 input. Returns the unsubscribe function. */
  onSysex(listener: (message: SysexMessage) => void): () => void;
  /**
   * Sends one or more complete SysEx messages unchanged to the UC4's output port (the USB port whose name matches the
   * connected input). Only on an explicit user action; never throws. The UC4 sends nothing back.
   * Low level: it sends any complete SysEx, `SndA` included. The caller decides what may go out (plan 0005 decision 20:
   * one `Sndc` to its own slot). All bytes go in one `send`, unpaced.
   */
  sendDump(bytes: Uint8Array): SendResult;
  /** Stops listening and drops the access; the browser keeps the port open. */
  dispose(): void;
}

/** 1 MiB: well above the largest dump (SndA, 100640 bytes); a cap against a stream that never ends. */
const MAX_SYSEX = 1 << 20;

export const UNSUPPORTED_MESSAGE =
  'This browser can’t talk to MIDI devices. Open the editor in Chrome or Edge to connect the UC4; files (JSON and .syx) work in any browser.';
export const DENIED_MESSAGE =
  'MIDI access was blocked. Allow “MIDI devices” for this site in the browser’s site settings (the icon left of the address), then press Connect again; files keep working.';

const notConnected = (access: boolean, deviceName: string): ConnectionState => ({
  kind: 'not-connected',
  access,
  message: access
    ? `No ${deviceName} found. Connect it by USB and switch it on; the editor notices it by itself.`
    : `Press Connect to let the editor listen to your ${deviceName}.`,
});

export function createDeviceConnection(options: {
  /** The device profile's port name, e.g. `Faderfox UC4`; matched case-insensitively as a part of the port's name. */
  portName: string;
  /** For messages, e.g. `UC4`; defaults to the port name. */
  deviceName?: string;
  env: MidiEnv;
  /** Clock for `receivedAt`; tests inject one. */
  now?: () => number;
  /**
   * The area guard run on every `sendDump`, after the bytes are known to be complete SysEx: the device profile's engine's
   * `checkSendable`. Required, so no connection can send without one. A refusal sends nothing.
   */
  checkSendable: (bytes: Uint8Array) => { ok: true } | { ok: false; reason: { message: string; whatToDo: string } };
}): DeviceConnection {
  const { portName, env } = options;
  const deviceName = options.deviceName ?? portName;
  const now = options.now ?? Date.now;
  const { checkSendable } = options;
  const wanted = portName.trim().toLowerCase();

  let state: ConnectionState = env.supported
    ? notConnected(false, deviceName)
    : { kind: 'unsupported', message: UNSUPPORTED_MESSAGE };
  let access: MidiAccessLike | null = null;
  let chosenId: string | null = null;
  let listening: MidiInputLike | null = null;
  let buffer: number[] | null = null;
  let disposed = false;
  let connectedAt: number | null = null;
  const stateListeners = new Set<(s: ConnectionState) => void>();
  const sysexListeners = new Set<(m: SysexMessage) => void>();

  function setState(next: ConnectionState) {
    if (JSON.stringify(next) === JSON.stringify(state)) return;
    state = next;
    for (const l of [...stateListeners]) l(state);
  }

  function onData(data: Uint8Array | null) {
    if (!data) return;
    for (const b of data) {
      if (b >= 0xf8) continue; // real-time bytes may sit inside a SysEx message
      if (b === 0xf0) buffer = [b];
      else if (b === 0xf7) {
        if (buffer) {
          const bytes = Uint8Array.from([...buffer, b]);
          buffer = null;
          const message = { bytes, receivedAt: now() };
          for (const l of [...sysexListeners]) l(message);
        }
      } else if (b >= 0x80) buffer = null; // a status byte ends a SysEx message that wasn't finished
      else if (buffer) {
        buffer.push(b);
        if (buffer.length > MAX_SYSEX) buffer = null; // a stream that never ends
      }
    }
  }

  function listenTo(input: MidiInputLike | null) {
    if (listening === input) return;
    if (listening) listening.onmidimessage = null;
    buffer = null;
    listening = input;
    if (input) input.onmidimessage = (e) => onData(e.data);
  }

  function evaluate() {
    if (disposed || !access) return;
    const inputs = [...access.inputs.values()].filter(
      (i) => i.state === 'connected' && (i.name ?? '').toLowerCase().includes(wanted),
    );
    const candidates = inputs.map((i) => ({ id: i.id, name: i.name ?? '' }));
    const chosen = inputs.find((i) => i.id === chosenId);
    const pick = inputs.length === 1 ? inputs[0] : chosen;
    if (pick) {
      listenTo(pick);
      if (state.kind !== 'connected' || state.port.id !== pick.id) connectedAt = now();
      setState({ kind: 'connected', port: { id: pick.id, name: pick.name ?? '' } });
    } else {
      listenTo(null);
      connectedAt = null;
      setState(candidates.length > 1 ? { kind: 'choose-port', candidates } : notConnected(true, deviceName));
    }
  }

  async function open() {
    if (!env.supported) return;
    if (access) { evaluate(); return; }
    try {
      access = await env.requestAccess();
      if (disposed) return;
      access.onstatechange = evaluate;
      evaluate();
    } catch (e) {
      const name = (e as { name?: string } | null)?.name;
      if (name === 'SecurityError' || name === 'NotAllowedError') setState({ kind: 'denied', message: DENIED_MESSAGE });
      else setState({ kind: 'not-connected', access: false, message: `The browser could not open MIDI (${name ?? 'unknown error'}). Reload the page and press Connect again.` });
    }
  }

  return {
    get state() { return state; },
    get connectedAt() { return access && state.kind === 'connected' ? connectedAt : null; },
    sendDump(bytes) {
      if (state.kind !== 'connected' || !access || !listening) {
        return { ok: false, reason: 'not-connected', message: `The ${deviceName} is not connected. Connect it by USB and press Connect.` };
      }
      if (!isCompleteSysex(bytes)) {
        return { ok: false, reason: 'invalid-bytes', message: 'These bytes are not a complete SysEx dump (F0 … F7); nothing was sent.' };
      }
      const guard = checkSendable(bytes);
      if (!guard.ok) return { ok: false, reason: 'refused', message: `${guard.reason.message} ${guard.reason.whatToDo}` };
      const outputs = [...access.outputs.values()].filter(
        (o) => o.state === 'connected' && (o.name ?? '').toLowerCase().includes(wanted),
      );
      const out = outputs.length === 1 ? outputs[0] : outputs.find((o) => o.name === listening!.name);
      if (!out) {
        return { ok: false, reason: 'no-output', message: `The editor found no MIDI output for the ${deviceName}. Unplug and replug it, then press Connect again.` };
      }
      try {
        out.send(bytes);
      } catch (e) {
        return { ok: false, reason: 'send-failed', message: `The browser could not send to the ${deviceName} (${(e as { name?: string } | null)?.name ?? 'unknown error'}). Check the USB cable, then send again.` };
      }
      return { ok: true, bytes: bytes.length };
    },
    connect: open,
    async reconnect() {
      if (!env.supported || access) return;
      let permission: PermissionResult = 'unsupported';
      try { permission = await env.queryPermission(); } catch { /* the browser can't say: stay quiet */ }
      if (permission === 'granted') await open();
      else if (permission === 'denied') setState({ kind: 'denied', message: DENIED_MESSAGE });
    },
    choosePort(id) {
      if (state.kind !== 'choose-port' || !state.candidates.some((c) => c.id === id)) return;
      chosenId = id;
      evaluate();
    },
    subscribe(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    onSysex(listener) {
      sysexListeners.add(listener);
      return () => sysexListeners.delete(listener);
    },
    dispose() {
      disposed = true;
      listenTo(null);
      if (access) access.onstatechange = null;
      access = null;
      stateListeners.clear();
      sysexListeners.clear();
    },
  };
}
