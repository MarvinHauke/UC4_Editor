// The MIDI inputs for the live view (plan 0008, decision 13): lists every input, delivers the channel messages of the
// chosen ones, drops and counts real-time and system messages. Listen only: nothing here sends, and it asks for no new
// permission (the access the UC4 connection holds covers all inputs; `connect()` is the same request, `reconnect()` never prompts).
// SysEx stays with `connection.ts` (the dump path); this module sees it and skips it.
import type { ChannelEvent, ChannelMessage } from '../live/messages.ts';
import type { MidiAccessLike, MidiEnv, MidiInputLike, PermissionResult } from './connection.ts';
import { DENIED_MESSAGE, UNSUPPORTED_MESSAGE } from './connection.ts';

export interface InputInfo { id: string; name: string; isUc4: boolean }

/** "all" or the id of one input. The UI remembers it in the browser; an id that is not plugged in keeps its choice and listens to nothing. */
export type InputSelection = 'all' | string;

/** What the listener says about itself: `message` is for the monitor's status line, never empty. */
export type ListenStatus =
  | { kind: 'unsupported' | 'denied' | 'not-started' | 'no-inputs' | 'input-missing' | 'listening'; message: string };

/** Messages that were not delivered, by what they were; `clock` is MIDI clock (F8), `activeSensing` is FE. */
export interface IgnoredCounts { clock: number; activeSensing: number; other: number }

export interface MidiInputs {
  /** Every connected input, in the browser's order. */
  readonly inputs: readonly InputInfo[];
  readonly selection: InputSelection;
  readonly status: ListenStatus;
  /** Real-time and system-common messages dropped since the start (or `resetIgnored`). Read it; a change notifies only when a kind appears for the first time. */
  readonly ignored: Readonly<IgnoredCounts>;
  /** On the user's click: asks for MIDI access (the browser prompts the first time). Never throws. */
  connect(): Promise<void>;
  /** On page load: starts only if the permission is already granted; never prompts. Never throws. */
  reconnect(): Promise<void>;
  select(selection: InputSelection): void;
  resetIgnored(): void;
  /** Called with every channel message of the chosen inputs. Returns the unsubscribe function. */
  onMessage(listener: (event: ChannelEvent) => void): () => void;
  /** Called after a change of inputs, selection, status or the first sight of an ignored kind (not at subscription). */
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

/** Per-input parser state: the running status and the data bytes collected so far. */
interface Parser { status: number; data: number[]; inSysex: boolean }

const dataLength = (status: number) => ((status & 0xf0) === 0xc0 || (status & 0xf0) === 0xd0 ? 1 : 2);

function toMessage(status: number, d: number[]): ChannelMessage | null {
  const channel = (status & 0x0f) + 1;
  const d0 = d[0] ?? 0;
  const d1 = d[1] ?? 0;
  switch (status & 0xf0) {
    case 0x80: return { kind: 'note', channel, number: d0, value: d1, on: false };
    case 0x90: return { kind: 'note', channel, number: d0, value: d1, on: d1 > 0 };
    case 0xa0: return { kind: 'polyAftertouch', channel, number: d0, value: d1 };
    case 0xb0: return { kind: 'cc', channel, number: d0, value: d1 };
    case 0xc0: return { kind: 'program', channel, number: d0, value: 0 };
    case 0xd0: return { kind: 'aftertouch', channel, number: null, value: d0 };
    case 0xe0: return { kind: 'pitchBend', channel, number: null, value: d0 | (d1 << 7) };
    default: return null;
  }
}

/**
 * Splits raw MIDI bytes into channel messages (running status honoured) and counts what it drops. Exported for tests.
 * Real-time bytes (F8–FF) may sit inside any message and are dropped without breaking it; system-common (F1–F6) and
 * SysEx are dropped (SysEx belongs to the dump path).
 */
export function parseChannelMessages(
  data: Uint8Array,
  parser: Parser,
  ignored: IgnoredCounts,
  emit: (m: ChannelMessage) => void,
): void {
  for (const b of data) {
    if (b >= 0xf8) {
      if (b === 0xf8) ignored.clock++;
      else if (b === 0xfe) ignored.activeSensing++;
      else ignored.other++;
    } else if (b >= 0x80) {
      if (b === 0xf0) { parser.inSysex = true; parser.status = 0; parser.data = []; }
      else if (b === 0xf7) { parser.inSysex = false; parser.status = 0; parser.data = []; }
      else if (b >= 0xf1) { ignored.other++; parser.inSysex = false; parser.status = 0; parser.data = []; }
      else { parser.inSysex = false; parser.status = b; parser.data = []; }
    } else if (parser.status && !parser.inSysex) {
      parser.data.push(b);
      if (parser.data.length === dataLength(parser.status)) {
        const m = toMessage(parser.status, parser.data);
        parser.data = []; // running status: the next data bytes reuse the status
        if (m) emit(m);
      }
    }
  }
}

export function createMidiInputs(options: {
  /** The device profile's port name, e.g. `Faderfox UC4`; matched case-insensitively as a part of the input's name (marks `isUc4`). */
  portName: string;
  env: MidiEnv;
  now?: () => number;
}): MidiInputs {
  const { env } = options;
  const now = options.now ?? Date.now;
  const wanted = options.portName.trim().toLowerCase();

  let access: MidiAccessLike | null = null;
  let disposed = false;
  let inputs: InputInfo[] = [];
  let selection: InputSelection = 'all';
  let status: ListenStatus = env.supported
    ? { kind: 'not-started', message: 'Press Connect to let the editor listen to your MIDI inputs.' }
    : { kind: 'unsupported', message: UNSUPPORTED_MESSAGE };
  const ignored: IgnoredCounts = { clock: 0, activeSensing: 0, other: 0 };
  const attached = new Map<string, { input: MidiInputLike; handler: (e: { data: Uint8Array | null }) => void }>();
  const messageListeners = new Set<(e: ChannelEvent) => void>();
  const changeListeners = new Set<() => void>();

  const notify = () => { for (const l of [...changeListeners]) l(); };

  function setStatus(next: ListenStatus) {
    if (next.kind === status.kind && next.message === status.message) return false;
    status = next;
    return true;
  }

  /** Which ignored kinds have been seen (a bit each): a change notifies once per kind, not on every clock tick. */
  const seen = () => (ignored.clock > 0 ? 1 : 0) + (ignored.activeSensing > 0 ? 2 : 0) + (ignored.other > 0 ? 4 : 0);

  function attach(input: MidiInputLike, info: InputInfo) {
    if (attached.has(input.id)) return;
    const parser: Parser = { status: 0, data: [], inSysex: false };
    const handler = (e: { data: Uint8Array | null }) => {
      if (!e.data) return;
      const before = seen();
      parseChannelMessages(e.data, parser, ignored, (message) => {
        const event: ChannelEvent = { message, inputId: info.id, isUc4: info.isUc4, at: now() };
        for (const l of [...messageListeners]) l(event);
      });
      const after = seen();
      if (after !== before) notify();
    };
    attached.set(input.id, { input, handler });
    input.addEventListener?.('midimessage', handler);
    void input.open?.()?.catch?.(() => { /* the browser reports a port that can't open as unplugged */ });
  }

  // Detach only removes our listener; it never closes the port, because the dump connection may be listening to it too.
  function detach(id: string) {
    const a = attached.get(id);
    if (!a) return;
    a.input.removeEventListener?.('midimessage', a.handler);
    attached.delete(id);
  }

  function evaluate() {
    if (disposed || !access) return;
    const live = [...access.inputs.values()].filter((i) => i.state === 'connected');
    const nextInputs = live.map((i) => ({ id: i.id, name: i.name ?? '', isUc4: (i.name ?? '').toLowerCase().includes(wanted) }));
    const wantedIds = new Set(selection === 'all' ? nextInputs.map((i) => i.id) : nextInputs.filter((i) => i.id === selection).map((i) => i.id));
    for (const id of [...attached.keys()]) if (!wantedIds.has(id)) detach(id);
    for (const i of live) if (wantedIds.has(i.id)) attach(i, nextInputs.find((n) => n.id === i.id)!);

    let next: ListenStatus;
    if (nextInputs.length === 0) next = { kind: 'no-inputs', message: 'No MIDI input found. Connect a device by USB and switch it on; the editor notices it by itself.' };
    else if (selection !== 'all' && wantedIds.size === 0) next = { kind: 'input-missing', message: 'The chosen input is not connected. Plug it in, or choose “All inputs”.' };
    else next = { kind: 'listening', message: selection === 'all' ? `Listening to ${nextInputs.length === 1 ? '1 input' : `${nextInputs.length} inputs`}…` : 'Listening to 1 input…' };

    const changed = JSON.stringify(nextInputs) !== JSON.stringify(inputs);
    inputs = nextInputs;
    if (setStatus(next) || changed) notify();
  }

  let pending: Promise<void> | null = null;
  function open(): Promise<void> {
    if (!env.supported) return Promise.resolve();
    if (access) { evaluate(); return Promise.resolve(); }
    pending ??= request().finally(() => { pending = null; });
    return pending;
  }

  async function request() {
    try {
      const granted = await env.requestAccess();
      if (disposed) return;
      access = granted;
      access.onstatechange = evaluate;
      evaluate();
    } catch (e) {
      const name = (e as { name?: string } | null)?.name;
      const next: ListenStatus = name === 'SecurityError' || name === 'NotAllowedError'
        ? { kind: 'denied', message: DENIED_MESSAGE }
        : { kind: 'not-started', message: `The browser could not open MIDI (${name ?? 'unknown error'}). Reload the page and press Connect again.` };
      if (setStatus(next)) notify();
    }
  }

  return {
    get inputs() { return inputs; },
    get selection() { return selection; },
    get status() { return status; },
    get ignored() { return ignored; },
    connect: open,
    async reconnect() {
      if (!env.supported || access || pending) return;
      let permission: PermissionResult = 'unsupported';
      try { permission = await env.queryPermission(); } catch { /* the browser can't say: stay quiet */ }
      if (permission === 'granted') await open();
      else if (permission === 'denied' && setStatus({ kind: 'denied', message: DENIED_MESSAGE })) notify();
    },
    select(next) {
      if (next === selection) return;
      selection = next;
      evaluate();
      notify();
    },
    resetIgnored() {
      const had = seen() !== 0;
      ignored.clock = 0; ignored.activeSensing = 0; ignored.other = 0;
      if (had) notify();
    },
    onMessage(listener) {
      messageListeners.add(listener);
      return () => { messageListeners.delete(listener); };
    },
    subscribe(listener) {
      changeListeners.add(listener);
      return () => { changeListeners.delete(listener); };
    },
    dispose() {
      disposed = true;
      for (const id of [...attached.keys()]) detach(id);
      if (access) access.onstatechange = null;
      access = null;
      messageListeners.clear();
      changeListeners.clear();
    },
  };
}
