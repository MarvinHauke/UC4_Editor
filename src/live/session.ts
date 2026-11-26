// The live session (plan 0008, decision 13): the one place where incoming messages become what the live view shows.
// Pure: no Web MIDI, DOM or Svelte. Step 1 holds the monitor rows; later steps grow the same session, not new modules:
//   step 2  `setContext({ configuration, setup, groups })` → each UC4 row gets `matches` (ranked), `pin(key, ref)`,
//           `controlStates` (live values per control, unknown until sent)
//   step 3  rows of a `CCAh` pair / a `notE` press and release are joined (`splitPairs` option, session storage by the UI);
//           `format` of the value (0–16383, on/off, +1/−1) is added to the row
//   step 4  `offer` (3 in a row matching only another group or setup), `dismissOffer(target)`, `silenceOffers`
//   step 7/8 `mapPlan(rowKey, target)` → a planned edit or a refusal reason; Map by touch reads the next UC4 event.
// The rows never leave memory (decision 11).
import { rowKey, type ChannelEvent, type MessageKind } from './messages.ts';

/** One monitor row: the latest value of one message key. */
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
  /** The input the latest message came from, and whether that is the UC4. */
  inputId: string;
  isUc4: boolean;
  /** Time of the latest message (ms since the epoch). */
  at: number;
  /** How many messages this key has had since the row appeared or Clear. */
  count: number;
  /** True for the one row that moved last. */
  lastMoved: boolean;
}

export interface LiveSession {
  /** The rows, newest key on top; a key that is already listed keeps its place and only its value changes. A new array after every change. */
  readonly rows: readonly MonitorRow[];
  /** The key of the row that moved last; null when there are no rows. */
  readonly lastMovedKey: string | null;
  /** Takes one channel message. Never throws; a malformed one (out of range) is ignored. */
  receive(event: ChannelEvent): void;
  /** Removes every row (the "Clear" button). */
  clear(): void;
  /** Called after every change (a message, Clear), not at subscription. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

/** A cap on distinct keys (poly aftertouch alone has 262 144); the oldest-created rows go first. Far above any real use. */
export const MAX_ROWS = 2000;

const inRange = (n: number | null, max: number) => n === null || (Number.isInteger(n) && n >= 0 && n <= max);

export function createLiveSession(options: { maxRows?: number } = {}): LiveSession {
  const maxRows = options.maxRows ?? MAX_ROWS;
  /** Newest key first. A row object is replaced on change, so a snapshot the UI holds never mutates. */
  let rows: MonitorRow[] = [];
  let lastMovedKey: string | null = null;
  const listeners = new Set<() => void>();

  const notify = () => { for (const l of [...listeners]) l(); };

  return {
    get rows() { return rows; },
    get lastMovedKey() { return lastMovedKey; },
    receive({ message: m, inputId, isUc4, at }) {
      const valid =
        Number.isInteger(m.channel) && m.channel >= 1 && m.channel <= 16 &&
        inRange(m.number, 127) && (m.number !== null || m.kind === 'pitchBend' || m.kind === 'aftertouch') && inRange(m.value, m.kind === 'pitchBend' ? 16383 : 127);
      if (!valid) return;
      const key = rowKey(inputId, m);
      const on = m.kind === 'note' ? (m.on ?? m.value > 0) : null;
      const index = rows.findIndex((r) => r.key === key);
      const previous = index >= 0 ? rows[index] : null;
      const row: MonitorRow = {
        key, kind: m.kind, channel: m.channel, number: m.number, value: m.value, on,
        inputId, isUc4, at, count: (previous?.count ?? 0) + 1, lastMoved: true,
      };
      const next = rows.map((r) => (r.lastMoved ? { ...r, lastMoved: false } : r));
      if (index >= 0) next[index] = row;
      else {
        next.unshift(row);
        if (next.length > maxRows) next.length = maxRows;
      }
      rows = next;
      lastMovedKey = key;
      notify();
    },
    clear() {
      if (rows.length === 0 && lastMovedKey === null) return;
      rows = [];
      lastMovedKey = null;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
