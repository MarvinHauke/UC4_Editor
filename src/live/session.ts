// The live session (plan 0008, decision 13): the one place where incoming messages become what the live view shows.
// Pure: no Web MIDI, DOM or Svelte. It holds the monitor rows (step 1) and, with a context, the matches, pins and
// control states of the UC4's rows (step 2). Later steps grow the same session, not new modules:
//   step 3  rows of a `CCAh` pair / a `notE` press and release are joined (`splitPairs` option, session storage by the UI);
//           `format` of the value (0–16383, on/off, +1/−1) is added to the row
//   step 4  `offer` (3 in a row matching only another group or setup), `dismissOffer(target)`, `silenceOffers`
//   step 7/8 `mapPlan(rowKey, target)` → a planned edit or a refusal reason; Map by touch reads the next UC4 event.
// The rows never leave memory (decision 11).
import { rowKey, type ChannelEvent, type MessageKind } from './messages.ts';
import {
  buildIndex, matchesFor, nextState, signatureOf,
  type ControlRef, type ControlState, type LiveContext, type Match, type MatchIndex,
} from './matching.ts';

/** One monitor row: the latest value of one message key from one input. */
export interface MonitorRow {
  /** `inputId|kind:channel:number` (see `rowKey`); stable for the row's life, one source per row. */
  key: string;
  kind: MessageKind;
  channel: number;
  number: number | null;
  /** The raw value of the latest message. */
  value: number;
  /** For `note`: true after a note-on with velocity above 0, false after a note-off. */
  on: boolean | null;
  /** The input the messages came from, and whether that is the UC4. */
  inputId: string;
  isUc4: boolean;
  /** Time of the latest message (ms since the epoch). */
  at: number;
  /** How many messages this key has had since the row appeared or Clear. */
  count: number;
  /** True for the one row that moved last. */
  lastMoved: boolean;
}

/** A row with what the open configuration says about it. Only the UC4's rows are matched; other devices' rows have no matches. */
export interface LiveRow extends MonitorRow {
  /** The controls that send this message, best first (the pinned one first, then tier, then place in the configuration). Empty without a context. */
  matches: readonly Match[];
  /** `matches[0]`, the control the device view lights and the row names; null when nothing matches. */
  best: Match | null;
  /** The "+n" on the row: how many matches there are besides the best. */
  more: number;
  /** True when `best` is the user's pin. */
  pinned: boolean;
}

export interface LiveSession {
  /** The rows, newest key on top; a key that is already listed keeps its place and only its value changes. A new array after every change. */
  readonly rows: readonly LiveRow[];
  /** The key of the row that moved last; null when there are no rows. */
  readonly lastMovedKey: string | null;
  /** Takes one channel message. Never throws; a malformed one (out of range) is ignored. */
  receive(event: ChannelEvent): void;
  /** Removes every row (the "Clear" button). Control states stay: they say what the UC4 did, not what the monitor lists. */
  clear(): void;

  /**
   * The editor's open setup and its two group selections (call again whenever one of them or the configuration changes; the
   * configuration is read, never kept for writing). A different open setup drops the pins. A control edited to send
   * something else loses its state. `null` (no configuration) leaves rows without matches.
   */
  setContext(context: LiveContext | null): void;
  /** Pins the control a row really is (one of its `matches`), until the open setup changes. `null` removes the pin. Anything else is ignored. */
  pin(rowKey: string, controlId: string | null): void;
  /** What each control last did, by `ControlRef.id`. A control that never sent is not in the map ("unknown"). A new map after every change. */
  readonly controlStates: ReadonlyMap<string, ControlState>;
  /** The control the last UC4 message was matched to (best or pinned) and when; null before the first. For the "lit" mark in the device view. */
  readonly lastTouched: { control: ControlRef; at: number } | null;

  /** Called after every change (a message, Clear, a context, a pin), not at subscription. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

/** A cap on distinct keys (poly aftertouch alone has 262 144); the oldest-created rows go first. Far above any real use. */
export const MAX_ROWS = 2000;

const inRange = (n: number | null, max: number) => n === null || (Number.isInteger(n) && n >= 0 && n <= max);

export function createLiveSession(options: { maxRows?: number } = {}): LiveSession {
  const maxRows = options.maxRows ?? MAX_ROWS;
  /** Newest key first. A row object is replaced on change, so a snapshot the UI holds never mutates. */
  let base: MonitorRow[] = [];
  let lastMovedKey: string | null = null;
  let context: LiveContext | null = null;
  let index: MatchIndex = buildIndex(null);
  const pins = new Map<string, string>();
  let states = new Map<string, ControlState>();
  const signatures = new Map<string, string>();
  const parts = new Map<string, { msb: number | null; lsb: number | null }>();
  let lastTouched: { control: ControlRef; at: number } | null = null;
  let view: LiveRow[] | null = null;
  const listeners = new Set<() => void>();

  const notify = () => { view = null; for (const l of [...listeners]) l(); };

  /** Best first: the pin, then tier order. */
  function rank(row: MonitorRow): Match[] {
    if (!row.isUc4 || !context) return [];
    const found = matchesFor(index, context, row);
    const pin = pins.get(row.key);
    const at = pin === undefined ? -1 : found.findIndex((m) => m.control.id === pin);
    if (at > 0) found.unshift(...found.splice(at, 1));
    return found;
  }

  /** A LiveRow per base row object: a row that did not change keeps its object, so a keyed list re-renders only what moved. Reset when matching inputs change. */
  let cache = new WeakMap<MonitorRow, LiveRow>();
  function derive(): LiveRow[] {
    return base.map((row) => {
      const hit = cache.get(row);
      if (hit) return hit;
      const matches = rank(row);
      const live: LiveRow = { ...row, matches, best: matches[0] ?? null, more: Math.max(0, matches.length - 1), pinned: matches.length > 0 && pins.get(row.key) === matches[0]!.control.id };
      cache.set(row, live);
      return live;
    });
  }

  function touch(event: ChannelEvent, best: Match) {
    const known = index.controls.get(best.control.id);
    if (!known) return;
    const id = best.control.id;
    const pair = parts.get(id) ?? { msb: null, lsb: null };
    parts.set(id, pair);
    const next = nextState(states.get(id), pair, known.data, best.via, event.message, event.at);
    signatures.set(id, signatureOf(known.data));
    if (next && next !== states.get(id)) states = new Map(states).set(id, next);
    lastTouched = { control: best.control, at: event.at };
  }

  return {
    get rows() { return (view ??= derive()); },
    get lastMovedKey() { return lastMovedKey; },
    get controlStates() { return states; },
    get lastTouched() { return lastTouched; },
    receive(event) {
      const { message: m, inputId, isUc4, at } = event;
      const valid =
        Number.isInteger(m.channel) && m.channel >= 1 && m.channel <= 16 &&
        inRange(m.number, 127) && (m.number !== null || m.kind === 'pitchBend' || m.kind === 'aftertouch') &&
        inRange(m.value, m.kind === 'pitchBend' ? 16383 : 127);
      if (!valid) return;
      const key = rowKey(inputId, m);
      const on = m.kind === 'note' ? (m.on ?? m.value > 0) : null;
      const at0 = base.findIndex((r) => r.key === key);
      const previous = at0 >= 0 ? base[at0] : null;
      const row: MonitorRow = {
        key, kind: m.kind, channel: m.channel, number: m.number, value: m.value, on,
        inputId, isUc4, at, count: (previous?.count ?? 0) + 1, lastMoved: true,
      };
      const next = base.map((r) => (r.lastMoved ? { ...r, lastMoved: false } : r));
      if (at0 >= 0) next[at0] = row;
      else {
        next.unshift(row);
        if (next.length > maxRows) next.length = maxRows;
      }
      base = next;
      lastMovedKey = key;
      if (isUc4 && context) {
        const best = rank(row)[0];
        if (best) touch(event, best);
      }
      notify();
    },
    clear() {
      if (base.length === 0 && lastMovedKey === null) return;
      base = [];
      lastMovedKey = null;
      notify();
    },
    setContext(next) {
      if (next?.setupId !== context?.setupId) pins.clear();
      context = next;
      index = buildIndex(next?.configuration ?? null);
      // A control that is gone or now sends something else says nothing about the device any more.
      let kept = states;
      for (const id of states.keys()) {
        const control = index.controls.get(id);
        if (!control || signatures.get(id) !== signatureOf(control.data)) {
          if (kept === states) kept = new Map(states);
          kept.delete(id); signatures.delete(id); parts.delete(id);
        }
      }
      states = kept;
      cache = new WeakMap();
      if (lastTouched && !index.controls.has(lastTouched.control.id)) lastTouched = null;
      // A pin whose control no longer sends the row's message is dropped.
      for (const [rowKeyOf, id] of [...pins]) {
        const row = base.find((r) => r.key === rowKeyOf);
        if (!row || !matchesFor(index, next, row).some((m) => m.control.id === id)) pins.delete(rowKeyOf);
      }
      notify();
    },
    pin(rowKeyOf, controlId) {
      if (controlId === null) {
        if (pins.delete(rowKeyOf)) { cache = new WeakMap(); notify(); }
        return;
      }
      const row = base.find((r) => r.key === rowKeyOf);
      if (!row || !row.isUc4 || !context) return;
      if (!matchesFor(index, context, row).some((m) => m.control.id === controlId)) return;
      pins.set(rowKeyOf, controlId);
      cache = new WeakMap();
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
