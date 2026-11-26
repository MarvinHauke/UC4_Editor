// Matching (plan 0008 step 2, decisions 4, 5): which controls of a configuration send a given message, ranked by context,
// and what a message tells about a control's state. Pure; reads the model, never writes it.
//
// A control sends (docs/reference/uc4-device.md, listen check 2026-11-16):
//   CCr1 CCr2 CCAb, button CC   CC at its channel and number      (CCr1 1/127, CCr2 65/63: relative ticks)
//   CCAh                        CC n (MSB) and CC n+32 (LSB)       (a lone half still matches; step 3 joins the pair)
//   notE                        note-on (press, upper) / note-off (release, lower) at channel and number
//   PrGC                        program change: a button's program is its upper value, an encoder's or fader's every program lower…upper
//   Pbnd, AFtt                  pitch bend / channel aftertouch at its channel (no number)
//   OFF                         nothing
import type { Setup, Uc4Config } from '../model/types.ts';
import type { ChannelMessage, MessageKind } from './messages.ts';

export type ControlArea = 'encoders' | 'pushButtons' | 'faders' | 'buttons';

/** A control of a configuration, named in the device's words. Groups and indexes are 0-based, as in `Selection` and the model arrays. */
export interface ControlRef {
  /** `setupId|area|group|index`; stable, usable as a map key. */
  id: string;
  setupId: string;
  setupName: string;
  slot?: number;
  area: ControlArea;
  group: number;
  index: number;
  /** "Enc3 · EG1", "Pbt3 · EG1", "FAd3 · FG2", "btn3 · FG2". */
  name: string;
}

/**
 * 1: the open setup, in its two selected groups; 2: the open setup's other groups; 3: the other setups.
 * `via` says which message of the control it was: its own, or half of a `CCAh` pair.
 */
export interface Match { control: ControlRef; tier: 1 | 2 | 3; via: 'message' | 'msb' | 'lsb' }

/** The editor's open setup and its two group selections (the device sends nothing on a group change; decision 4). */
export interface LiveContext {
  configuration: Uc4Config;
  setupId: string;
  /** 0–7 */
  encoderGroup: number;
  /** 0–7 */
  faderButtonGroup: number;
}

/** What a control last did. A control that never sent has no state ("unknown"). */
export type ControlState =
  /** A fader, an absolute encoder or `PrGC`/`Pbnd`/`AFtt`: the raw `value` and where it sits between lower and upper (0–1, null when lower = upper). `CCAh` shows once both halves arrived; its fraction is value/16383, lower and upper are not applied (not known for `CCAh`). */
  | { kind: 'absolute'; value: number; fraction: number | null; at: number }
  /** A relative encoder: the last tick (±n; ±1 for `CCr1` 1/127 and `CCr2` 65/63) and the net ticks since the session started. */
  | { kind: 'relative'; delta: number; total: number; at: number }
  /** A button that sends on/off (`notE`, `CC`, `AFtt`): on/off from the value sent: the upper value or a note-on is on, the lower value or a note-off is off (a `toGL` button sends them alternately). */
  | { kind: 'button'; on: boolean; at: number }
  /** A `PrGC` button: it has a press only, no release. */
  | { kind: 'trigger'; count: number; value: number; at: number };

interface ControlData { type: string; mode: string; channel: number; number: number; lower: number; upper: number }

export interface Entry {
  ref: ControlRef;
  data: ControlData;
  half: 'enc' | 'fad';
  via: Match['via'];
  /** Tie-break inside one tier: the control's place in the configuration. */
  order: number;
}

export interface MatchIndex {
  /** Entries by match key. */
  byKey: Map<string, Entry[]>;
  /** Every control by id, for state checks. */
  controls: Map<string, { ref: ControlRef; data: ControlData; half: 'enc' | 'fad' }>;
}

/** The key two messages share (the model's message key): the number counts except for pitch bend and aftertouch; for program change it is the program. */
export function matchKey(kind: MessageKind, channel: number, number: number | null): string {
  return kind === 'pitchBend' || kind === 'aftertouch' ? `${kind}:${channel}:` : `${kind}:${channel}:${number ?? ''}`;
}

/** The messages a control sends, as match keys. A `PrGC` button sends its upper value as the program, an encoder or fader every program from lower to upper. */
function sends(c: ControlData, isButton: boolean): { key: string; via: Match['via'] }[] {
  const { channel, number } = c;
  if (!Number.isInteger(channel) || !Number.isInteger(number)) return [];
  switch (c.type) {
    case 'CCr1': case 'CCr2': case 'CCAb': case 'CC':
      return [{ key: matchKey('cc', channel, number), via: 'message' }];
    case 'CCAh':
      return [{ key: matchKey('cc', channel, number), via: 'msb' }, { key: matchKey('cc', channel, number + 32), via: 'lsb' }];
    case 'notE': return [{ key: matchKey('note', channel, number), via: 'message' }];
    case 'PrGC': {
      const lo = isButton ? c.upper : Math.min(c.lower, c.upper);
      const hi = isButton ? c.upper : Math.max(c.lower, c.upper);
      if (!Number.isInteger(lo) || !Number.isInteger(hi)) return [];
      return Array.from({ length: hi - lo + 1 }, (_, i) => ({ key: matchKey('program', channel, lo + i), via: 'message' as const }));
    }
    case 'Pbnd': return [{ key: matchKey('pitchBend', channel, null), via: 'message' }];
    case 'AFtt': return [{ key: matchKey('aftertouch', channel, null), via: 'message' }];
    default: return [];
  }
}

const AREAS: { area: ControlArea; half: 'enc' | 'fad'; short: string }[] = [
  { area: 'encoders', half: 'enc', short: 'Enc' },
  { area: 'pushButtons', half: 'enc', short: 'Pbt' },
  { area: 'faders', half: 'fad', short: 'FAd' },
  { area: 'buttons', half: 'fad', short: 'btn' },
];

export const controlId = (setupId: string, area: ControlArea, group: number, index: number) => `${setupId}|${area}|${group}|${index}`;

function setupControls(setup: Setup, visit: (area: ControlArea, half: 'enc' | 'fad', group: number, index: number, name: string, c: ControlData) => void) {
  const groups = { enc: setup.encoderGroups ?? [], fad: setup.faderButtonGroups ?? [] };
  for (const { area, half, short } of AREAS) {
    const list = half === 'enc' ? groups.enc : groups.fad;
    list.forEach((g, gi) => {
      const controls = (g as unknown as Record<string, ControlData[] | undefined> | undefined)?.[area] ?? [];
      controls.forEach((c, i) => {
        if (c) visit(area, half, gi, i, `${short}${i + 1} · ${half === 'enc' ? 'EG' : 'FG'}${gi + 1}`, c);
      });
    });
  }
}

export function buildIndex(configuration: Uc4Config | null): MatchIndex {
  const byKey = new Map<string, Entry[]>();
  const controls: MatchIndex['controls'] = new Map();
  let order = 0;
  for (const setup of Array.isArray(configuration?.setups) ? configuration!.setups : []) {
    setupControls(setup, (area, half, group, index, name, c) => {
      const ref: ControlRef = {
        id: controlId(setup.id, area, group, index), setupId: setup.id, setupName: setup.name,
        ...(setup.slot === undefined ? {} : { slot: setup.slot }), area, group, index, name,
      };
      const data: ControlData = { type: c.type, mode: c.mode, channel: c.channel, number: c.number, lower: c.lower, upper: c.upper };
      controls.set(ref.id, { ref, data, half });
      for (const s of sends(data, area === 'pushButtons' || area === 'buttons')) {
        const entry: Entry = { ref, data, half, via: s.via, order: order++ };
        const list = byKey.get(s.key);
        if (list) list.push(entry); else byKey.set(s.key, [entry]);
      }
    });
  }
  return { byKey, controls };
}

/** The controls that send this message, best first: tier, then place in the configuration. */
export function matchesFor(index: MatchIndex, context: LiveContext | null, m: Pick<ChannelMessage, 'kind' | 'channel' | 'number'>): Match[] {
  const entries = index.byKey.get(matchKey(m.kind, m.channel, m.number)) ?? [];
  const tierOf = (e: Entry): 1 | 2 | 3 => {
    if (!context || e.ref.setupId !== context.setupId) return 3;
    const selected = e.half === 'enc' ? context.encoderGroup : context.faderButtonGroup;
    return e.ref.group === selected ? 1 : 2;
  };
  return entries
    .map((e) => ({ e, tier: tierOf(e) }))
    .sort((a, b) => a.tier - b.tier || a.e.order - b.e.order)
    .map(({ e, tier }) => ({ control: e.ref, tier, via: e.via }));
}

// ---- state ----

const isRelative = (type: string) => type === 'CCr1' || type === 'CCr2';

/** `CCr1` is two's complement (1 = +1, 127 = −1), `CCr2` binary offset around 64 (65 = +1, 63 = −1). 0 for no change. */
export function relativeDelta(type: string, value: number): number {
  if (type === 'CCr2') return value - 64;
  return value < 64 ? value : value - 128;
}

function fractionOf(value: number, lower: number, upper: number): number | null {
  if (lower === upper) return null;
  return Math.min(1, Math.max(0, (value - lower) / (upper - lower)));
}

/** What a control's own signature is: a state is dropped when the control is edited to send something else. */
export const signatureOf = (d: ControlData) => `${d.type}|${d.mode}|${d.channel}|${d.number}|${d.lower}|${d.upper}`;

/** The state after `message` reached the control, or the same state when it tells nothing new. `parts` holds a `CCAh` pair's halves. */
export function nextState(
  previous: ControlState | undefined,
  parts: { msb: number | null; lsb: number | null },
  control: ControlData,
  via: Match['via'],
  m: ChannelMessage,
  at: number,
): ControlState | undefined {
  const { type } = control;
  if (isRelative(type)) {
    if (m.kind !== 'cc') return previous;
    const delta = relativeDelta(type, m.value);
    return { kind: 'relative', delta, total: (previous?.kind === 'relative' ? previous.total : 0) + delta, at };
  }
  if (type === 'CCAh') {
    if (via === 'msb') { parts.msb = m.value; parts.lsb = null; return previous; }
    parts.lsb = m.value;
    if (parts.msb === null) return previous;
    const value = parts.msb * 128 + parts.lsb;
    return { kind: 'absolute', value, fraction: value / 16383, at };
  }
  const isButton = control.mode === 'btn' || control.mode === 'toGL';
  if (isButton) {
    if (type === 'PrGC') return { kind: 'trigger', count: (previous?.kind === 'trigger' ? previous.count : 0) + 1, value: m.number ?? 0, at };
    if (type === 'notE') return m.kind === 'note' ? { kind: 'button', on: m.on ?? m.value > 0, at } : previous;
    // `CC`, `AFtt`: the upper value on press, the lower on release (inverted when lower > upper).
    return { kind: 'button', on: m.value === control.upper ? true : m.value !== control.lower, at };
  }
  if (type === 'Pbnd') return { kind: 'absolute', value: m.value, fraction: m.value / 16383, at };
  const value = m.kind === 'program' ? (m.number ?? 0) : m.value;
  return { kind: 'absolute', value, fraction: fractionOf(value, control.lower, control.upper), at };
}
