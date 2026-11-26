// The live session (plan 0008, decision 13): the one place where incoming messages become what the live view shows.
// Pure: no Web MIDI, DOM or Svelte. It holds the monitor rows (step 1) and, with a context, the matches, pins and
// control states of the UC4's rows (step 2). Later steps grow the same session, not new modules:
//   step 7/8 `mapPlan(rowKey, target)` → a planned edit or a refusal reason; Map by touch reads the next UC4 event.
// Step 4 added the switch offer (`offer`, `acceptOffer`, `dismissOffer`, `silenceOffers`). Step 3 added pairs (a `CCAh` pair or a note's on and off as one row, always joined: decision 28) and `valueText`; the rows never
// leave memory (decision 11), only the silenced offers are session state the UI saves (`getState`).
import { rowKey, type ChannelEvent, type MessageKind } from './messages.ts';
import { planMap, refusalFor, type MapOptions, type MapPlan } from './mapping.ts';
import {
  buildIndex, matchesFor, nextState, relativeDelta, signatureOf,
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

/** The single messages a pair row stands for, for the details text ("MSB 64 · LSB 0", "last on 127 · last off 0"); `null` is a half not seen yet. */
export type PairParts =
  | { msb: number | null; lsb: number | null }
  | { lastOn: number | null; lastOff: number | null };

/** Where a row stands in a pair (decisions 12 and 28): a `CCAh` control's CC n and n+32, or a note's on and off. A pair is always one row. */
export interface PairInfo {
  /** The pair's key; for a joined `CCAh` row it is the row's own key. */
  key: string;
  kind: 'ccah' | 'note';
  /** `joined`: this row stands for both messages (every note row; a `CCAh` row with both halves seen); `waiting`: a `CCAh` half whose other half has not been seen yet. */
  state: 'joined' | 'waiting';
  /**
   * `CCAh`: `{ msb, lsb }`, the 7-bit values of CC n and n+32 (a half not seen yet is `null`; a joined row has both).
   * Note: `{ lastOn, lastOff }`, the velocity of the last press and of the last release (`null` until seen; Clear forgets both).
   * Narrow with `pair.kind` or `'msb' in parts`.
   */
  parts: PairParts;
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
  /** The control this row was mapped to (`markMapped`), for "→ Enc3 · EG1"; null before. */
  mappedTo: ControlRef | null;
  /** Set for a `CCAh` match and for every note row; null otherwise. A joined `CCAh` row has `kind: 'cc'`, the coarse CC as `number` and the 14-bit value 0–16383 as `value`. */
  pair: PairInfo | null;
  /** What the monitor prints as the value: `64`, `8192`, `on 127` / `off 0`, `+1` / `−1` for a `CCr1`/`CCr2` match, `—` for a program change (its number is the key). */
  valueText: string;
}

/** What the UI saves in the session storage and hands back after a reload (JSON-safe). */
export interface LiveSessionState {
  /** "Don't ask again" on the switch offer. */
  silenceOffers: boolean;
}

/** Whether a control of the open groups can take a row's message (for dimming while Map is armed); `reason` is the help-line sentence. */
export interface MapTarget { control: ControlRef; ok: boolean; reason: string | null }

/**
 * The control a UC4 message picked while Map was armed (decision 20: Map by touch), and what the editor has to switch to
 * so the control is shown: only the parts that differ from the open setup and groups are set.
 */
export interface TouchTarget {
  control: ControlRef;
  switch: { setupId?: string; encoderGroup?: number; faderButtonGroup?: number };
  /** The message that picked it. */
  at: number;
}

/**
 * "The UC4 seems to be on encoder group 3 — switch?" (decision 6): the open setup and groups the evidence points to.
 * The session only reports it; the UI changes the selections as one undo step when the user accepts.
 */
export interface SwitchOffer {
  target: { setupId: string; setupName: string; slot?: number; encoderGroup: number; faderButtonGroup: number };
  /** What would change against the open setup and groups. */
  changes: ('setup' | 'encoderGroup' | 'faderButtonGroup')[];
  /** The question, in the device's words, groups numbered 1–8. */
  text: string;
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

  /**
   * Set after 3 UC4 messages in a row that match something but nothing in the open setup's two selected groups, all pointing at
   * one target. A message of the open groups, any `setContext` call (also an edit of the configuration), a dismissal or silence takes it away; messages that match nothing
   * and other devices' messages are neutral. A new object only when the target changes.
   */
  readonly offer: SwitchOffer | null;
  /** The user took the offer: gives it once (the UI switches the selections) and clears it. Null when there is none. */
  acceptOffer(): SwitchOffer | null;
  /** "No": no offer for this target until the open setup changes. */
  dismissOffer(): void;
  /** "Don't ask again": no offers at all while on (saved with `getState`). */
  silenceOffers(on: boolean): void;

  /**
   * Plans what mapping the row onto a control would do (decisions 8, 14, 17): a planned edit or a refusal for the help line.
   * Applies nothing; the UI makes the edit as one undo step (with the group switch of a `touchTarget`) and then calls `markMapped`.
   * A row from any input can be mapped; a joined `CCAh` row maps as CC n. A click target must be in the open setup; the control a
   * `touchTarget` picked may be in another one: the UI then switches setup and groups and applies the edit as one step, and the
   * result line names the setup. Call `mapPlan` before `disarm()`: a touch target is only known while armed.
   */
  mapPlan(rowKey: string, target: string | ControlRef, options?: MapOptions): MapPlan;
  /** For every control of the open setup's two selected groups: can it take this row's message (dim the others, show `reason`). Empty without a context or row. */
  mapTargets(rowKey: string): MapTarget[];
  /** Remembers that the row was mapped to the control (shown as `mappedTo`); `null` forgets. Rows are kept in memory only, like the rows. */
  markMapped(rowKey: string, controlId: string | null): void;
  /** The next row after `rowKey` in the list (older ones, wrapping to the newest) that is not mapped yet, or null when all are. Without a key, the first. */
  nextUnmapped(rowKey?: string): LiveRow | null;
  /** Arms Map for a row: the next UC4 message picks the target (`touchTarget`) and does not count as evidence for the switch offer. */
  armMap(rowKey: string): void;
  /** Ends Map (after a mapping, Esc, Map again). Clears `touchTarget`. */
  disarm(): void;
  /** The key of the armed row, or null. */
  readonly armed: string | null;
  /** Set by the first UC4 message that matches a control while armed; later messages don't replace it until `armMap` again. */
  readonly touchTarget: TouchTarget | null;

  /** The saved state (a new object). Save it after every change (`subscribe`) in the session storage: it survives a reload and ends with the tab. */
  getState(): LiveSessionState;
  /** Takes back what `getState` gave; anything malformed is ignored, never thrown. Call it before the first message. */
  restoreState(state: unknown): void;

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

  const rowsView = () => (view ??= derive());

  const notify = () => { view = null; for (const l of [...listeners]) l(); };

  const mapped = new Map<string, ControlRef>();
  const seen = new Map<string, { count: number; values: Set<number> }>();
  let armedKey: string | null = null;
  let touch2: TouchTarget | null = null;
  let silenced = false;
  let offer: SwitchOffer | null = null;
  const dismissed = new Set<string>();
  /** The last messages that matched only elsewhere (at most 3), oldest first. */
  let streak: { setupId: string; setupName: string; slot?: number; half: 'enc' | 'fad'; group: number }[] = [];
  /** The velocity of the last on and the last off of every note row, for `pair.parts`. */
  const noteParts = new Map<string, { on: number | null; off: number | null }>();

  const partnerOf = (number: number, via: 'msb' | 'lsb') => (via === 'msb' ? number + 32 : number - 32);
  const ccahKey = (inputId: string, channel: number, msb: number) => `${inputId}|ccah:${channel}:${msb}`;

  /** Best first: the pin, then tier order. */
  function applyPin(key: string, found: Match[]): Match[] {
    const pin = pins.get(key);
    const at = pin === undefined ? -1 : found.findIndex((m) => m.control.id === pin);
    if (at > 0) found.unshift(...found.splice(at, 1));
    return found;
  }
  const rank = (row: MonitorRow): Match[] => (!row.isUc4 || !context ? [] : applyPin(row.key, matchesFor(index, context, row)));

  function valueText(row: MonitorRow, best: Match | null): string {
    if (row.kind === 'note') return `${row.on ? 'on' : 'off'} ${row.value}`;
    if (row.kind === 'program') return '—';
    const type = best && row.kind === 'cc' ? index.controls.get(best.control.id)?.data.type : undefined;
    if (type === 'CCr1' || type === 'CCr2') {
      const d = relativeDelta(type, row.value);
      return d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '0';
    }
    return String(row.value);
  }

  function build(row: MonitorRow, matches: Match[], pair: PairInfo | null): LiveRow {
    return {
      ...row, matches, best: matches[0] ?? null, more: Math.max(0, matches.length - 1),
      pinned: matches.length > 0 && pins.get(row.key) === matches[0]!.control.id,
      mappedTo: mapped.get(row.key) ?? null, pair, valueText: valueText(row, matches[0] ?? null),
    };
  }

  /** A LiveRow per base row object: a row that did not change keeps its object, so a keyed list re-renders only what moved. Reset when matching inputs change. */
  let cache = new WeakMap<MonitorRow, LiveRow>();
  let joinedCache = new WeakMap<MonitorRow, WeakMap<MonitorRow, LiveRow>>();
  const resetCache = () => { cache = new WeakMap(); joinedCache = new WeakMap(); };

  function single(row: MonitorRow): LiveRow {
    const hit = cache.get(row);
    if (hit) return hit;
    const matches = rank(row);
    const best = matches[0];
    let pair: PairInfo | null = null;
    if (row.kind === 'note') {
      const p = noteParts.get(row.key);
      pair = { key: row.key, kind: 'note', state: 'joined', parts: { lastOn: p?.on ?? null, lastOff: p?.off ?? null } };
    }
    else if (best && (best.via === 'msb' || best.via === 'lsb') && row.number !== null) {
      const key = ccahKey(row.inputId, row.channel, best.via === 'msb' ? row.number : row.number - 32);
      const isMsb = best.via === 'msb';
      pair = { key, kind: 'ccah', state: 'waiting', parts: { msb: isMsb ? row.value : null, lsb: isMsb ? null : row.value } };
    }
    const live = build(row, matches, pair);
    cache.set(row, live);
    return live;
  }

  /** Rows keep their place; a joined `CCAh` row takes the place of the half that was listed first (the newer-created key). */
  function derive(): LiveRow[] {
    const out: LiveRow[] = [];
    const byKey = new Map(base.map((r) => [r.key, r]));
    const consumed = new Set<string>();
    for (const row of base) {
      if (consumed.has(row.key)) continue;
      const mine = single(row);
      const pair = mine.pair;
      if (pair?.kind === 'ccah' && mine.best && pair.state === 'waiting' && row.number !== null) {
        const via = mine.best.via as 'msb' | 'lsb';
        const other = byKey.get(`${row.inputId}|cc:${row.channel}:${partnerOf(row.number, via)}`);
        const theirs = other && !consumed.has(other.key) ? single(other) : null;
        const complement = via === 'msb' ? 'lsb' : 'msb';
        if (other && theirs?.best?.control.id === mine.best.control.id && theirs.best.via === complement) {
          consumed.add(other.key);
          const [msb, lsb] = via === 'msb' ? [row, other] : [other, row];
          out.push(joined(msb, lsb, pair.key));
          continue;
        }
      }
      out.push(mine);
    }
    return out;
  }

  function joined(msb: MonitorRow, lsb: MonitorRow, key: string): LiveRow {
    let inner = joinedCache.get(msb);
    const hit = inner?.get(lsb);
    if (hit) return hit;
    const msbLive = single(msb), lsbLive = single(lsb);
    const both = msbLive.matches.filter((m) => m.via === 'msb' && lsbLive.matches.some((l) => l.control.id === m.control.id && l.via === 'lsb'));
    const row: MonitorRow = {
      ...msb, key, value: msb.value * 128 + lsb.value, on: null, at: Math.max(msb.at, lsb.at),
      count: Math.max(msb.count, lsb.count), lastMoved: msb.lastMoved || lsb.lastMoved,
    };
    const live = build(row, applyPin(key, both), { key, kind: 'ccah', state: 'joined', parts: { msb: msb.value, lsb: lsb.value } });
    if (!inner) joinedCache.set(msb, (inner = new WeakMap()));
    inner.set(lsb, live);
    return live;
  }

  const offerKey = (t: SwitchOffer['target']) => `${t.setupId}|${t.encoderGroup}|${t.faderButtonGroup}`;

  function evaluateOffer() {
    if (!context || silenced || streak.length < 3) { offer = null; return; }
    const first = streak[0]!;
    if (streak.some((e) => e.setupId !== first.setupId)) { offer = null; return; }
    const groupOf = (half: 'enc' | 'fad'): number | null | undefined => {
      const groups = new Set(streak.filter((e) => e.half === half).map((e) => e.group));
      return groups.size === 0 ? null : groups.size === 1 ? [...groups][0] : undefined;
    };
    const enc = groupOf('enc'), fad = groupOf('fad');
    if (enc === undefined || fad === undefined) { offer = null; return; }
    const target: SwitchOffer['target'] = {
      setupId: first.setupId, setupName: first.setupName, ...(first.slot === undefined ? {} : { slot: first.slot }),
      encoderGroup: enc ?? context.encoderGroup, faderButtonGroup: fad ?? context.faderButtonGroup,
    };
    if (dismissed.has(offerKey(target))) { offer = null; return; }
    if (offer && offerKey(offer.target) === offerKey(target)) return;
    const changes: SwitchOffer['changes'] = [];
    if (target.setupId !== context.setupId) changes.push('setup');
    if (target.encoderGroup !== context.encoderGroup) changes.push('encoderGroup');
    if (target.faderButtonGroup !== context.faderButtonGroup) changes.push('faderButtonGroup');
    const groups = [
      ...(changes.includes('encoderGroup') ? [`encoder group ${target.encoderGroup + 1}`] : []),
      ...(changes.includes('faderButtonGroup') ? [`fader/button group ${target.faderButtonGroup + 1}`] : []),
    ].join(' and ');
    const setup = changes.includes('setup') ? `setup ${target.slot === undefined ? target.setupName : `SE${String(target.slot).padStart(2, '0')}`}` : '';
    offer = { target, changes, text: `The UC4 seems to be on ${[setup, groups].filter(Boolean).join(', ')} — switch?` };
  }

  /**
   * Evidence for the offer (decision 6): a UC4 message that matches something counts, one in the open groups starts over, one that
   * could be in several other places (or setups) is neutral. One touch can give 3 messages (a nudge, a note on and off): that is
   * meant, an unambiguous message says where the UC4 is.
   */
  function collect(row: MonitorRow) {
    if (!context || armedKey !== null) return;
    const found = matchesFor(index, context, row);
    if (found.length === 0) return;
    if (found.some((m) => m.tier === 1)) { streak = []; offer = null; return; }
    // Never guess (decision 6): the message counts only when all its matches point at one target (setup, half, group), or the user pinned one.
    const half = (area: string) => (area === 'encoders' || area === 'pushButtons' ? 'enc' : 'fad');
    const pinned = pins.get(row.key);
    const chosen = pinned === undefined ? undefined : found.find((m) => m.control.id === pinned);
    const targets = new Set(found.map((m) => `${m.control.setupId}|${half(m.control.area)}|${m.control.group}`));
    if (!chosen && targets.size > 1) return;
    const best = chosen ?? found[0]!;
    const { area, group, setupId, setupName, slot } = best.control;
    streak = [...streak, { setupId, setupName, ...(slot === undefined ? {} : { slot }), half: half(area) as 'enc' | 'fad', group }].slice(-3);
    evaluateOffer();
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
    get rows() { return rowsView(); },
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
        if (next.length > maxRows) {
          // A trimmed key starts afresh when it returns: no old mark, pin or values.
          for (const gone of next.slice(maxRows)) { seen.delete(gone.key); noteParts.delete(gone.key); mapped.delete(gone.key); pins.delete(gone.key); }
          next.length = maxRows;
        }
      }
      base = next;
      lastMovedKey = key;
      if (m.kind === 'cc') {
        const history = seen.get(key) ?? { count: 0, values: new Set<number>() };
        history.count++;
        history.values.add(m.value);
        seen.set(key, history);
      }
      if (m.kind === 'note') {
        const parts = noteParts.get(key) ?? { on: null, off: null };
        parts[on ? 'on' : 'off'] = m.value;
        noteParts.set(key, parts);
      }
      if (isUc4 && context) {
        const best = rank(row)[0];
        if (best) touch(event, best);
        if (armedKey !== null && touch2 === null && best) {
          const c = best.control;
          const sw: TouchTarget['switch'] = {};
          if (c.setupId !== context.setupId) sw.setupId = c.setupId;
          const encHalf = c.area === 'encoders' || c.area === 'pushButtons';
          if (encHalf && c.group !== context.encoderGroup) sw.encoderGroup = c.group;
          if (!encHalf && c.group !== context.faderButtonGroup) sw.faderButtonGroup = c.group;
          // another setup shows its own groups: keep the selection of the half that wasn't touched
          touch2 = { control: c, switch: sw, at };
        }
        collect(row);
      }
      notify();
    },
    clear() {
      if (base.length === 0 && lastMovedKey === null) return;
      base = [];
      lastMovedKey = null;
      noteParts.clear();
      mapped.clear();
      seen.clear();
      armedKey = null;
      touch2 = null;
      notify();
    },
    setContext(next) {
      if (next?.setupId !== context?.setupId) { pins.clear(); dismissed.clear(); }
      context = next;
      streak = [];
      offer = null;
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
      resetCache();
      if (lastTouched && !index.controls.has(lastTouched.control.id)) lastTouched = null;
      for (const [k, c] of [...mapped]) if (!index.controls.has(c.id)) mapped.delete(k);
      // A pin whose control no longer sends the row's message is dropped.
      const rows = derive();
      for (const [key, id] of [...pins]) {
        const shown = rows.find((r) => r.key === key);
        const source = base.find((r) => r.key === key);
        const found: readonly Match[] = shown ? shown.matches : source ? matchesFor(index, next, source) : [];
        if (!found.some((m) => m.control.id === id)) pins.delete(key);
      }
      resetCache();
      notify();
    },
    pin(key, controlId) {
      const row = rowsView().find((r) => r.key === key);
      if (!row) return;
      // A joined row stands for source rows: the pin goes to all keys the matching reads (`touch` reads the base key).
      const keys = [key];
      if (row.pair?.kind === 'ccah') {
        const msb = Number(row.pair.key.slice(row.pair.key.lastIndexOf(':') + 1));
        keys.push(row.pair.key, `${row.inputId}|cc:${row.channel}:${msb}`, `${row.inputId}|cc:${row.channel}:${msb + 32}`);
      }
      if (controlId === null) {
        let changed = false;
        for (const k of keys) changed = pins.delete(k) || changed;
        if (changed) { resetCache(); notify(); }
        return;
      }
      if (!row.isUc4 || !context || !row.matches.some((m) => m.control.id === controlId)) return;
      for (const k of keys) pins.set(k, controlId);
      resetCache();
      notify();
    },
    get offer() { return offer; },
    get armed() { return armedKey; },
    get touchTarget() { return touch2; },
    mapPlan(key, target, options) {
      const row = rowsView().find((r) => r.key === key);
      if (!row) return { ok: false, reason: 'That row is not in the monitor any more.' };
      if (!context) return { ok: false, reason: 'Open a setup first.' };
      const ref = typeof target === 'string' ? index.controls.get(target)?.ref : index.controls.get(target.id)?.ref;
      if (!ref) return { ok: false, reason: 'That control is not in the open configuration.' };
      // A click is limited to the open setup; only the control a touch picked may be in another one (decision 8, exceptions).
      const elsewhere = ref.setupId !== context.setupId;
      if (elsewhere && touch2?.control.id !== ref.id) return { ok: false, reason: 'That control is not in the open setup.' };
      const plan = planMap(context.configuration, ref, { kind: row.kind, channel: row.channel, number: row.number, value: row.value, seen: seen.get(row.key) }, options);
      if (plan.ok && elsewhere) plan.resultText = `${ref.slot === undefined ? ref.setupName : `SE${String(ref.slot).padStart(2, '0')}`} · ${plan.resultText}`;
      return plan;
    },
    mapTargets(key) {
      const row = rowsView().find((r) => r.key === key);
      if (!row || !context) return [];
      const order: Record<string, number> = { encoders: 0, pushButtons: 1, faders: 2, buttons: 3 };
      return [...index.controls.values()]
        .map((c) => c.ref)
        .filter((r) => r.setupId === context!.setupId && r.group === (r.area === 'encoders' || r.area === 'pushButtons' ? context!.encoderGroup : context!.faderButtonGroup))
        .sort((a, b) => order[a.area]! - order[b.area]! || a.index - b.index)
        .map((control) => { const reason = refusalFor(control.area, row.kind); return { control, ok: reason === null, reason }; });
    },
    markMapped(key, controlId) {
      if (controlId === null) { if (mapped.delete(key)) { resetCache(); notify(); } return; }
      const ref = index.controls.get(controlId)?.ref;
      if (!ref) return;
      mapped.set(key, ref);
      resetCache();
      notify();
    },
    nextUnmapped(key) {
      const rows = rowsView();
      const start = key === undefined ? -1 : rows.findIndex((r) => r.key === key);
      for (let i = 1; i <= rows.length; i++) {
        const row = rows[(start + i) % rows.length]!;
        if (row.key !== key && !mapped.has(row.key)) return row;
      }
      return null;
    },
    armMap(key) {
      if (!rowsView().some((r) => r.key === key)) return;
      armedKey = key;
      touch2 = null;
      notify();
    },
    disarm() {
      if (armedKey === null && touch2 === null) return;
      armedKey = null;
      touch2 = null;
      notify();
    },
    acceptOffer() {
      const taken = offer;
      if (!taken) return null;
      offer = null; streak = [];
      notify();
      return taken;
    },
    dismissOffer() {
      if (!offer) return;
      dismissed.add(offerKey(offer.target));
      offer = null;
      notify();
    },
    silenceOffers(on) {
      if (silenced === on) return;
      silenced = on;
      if (on) offer = null;
      notify();
    },
    getState() { return { silenceOffers: silenced }; },
    restoreState(state) {
      silenced = (state as { silenceOffers?: unknown } | null)?.silenceOffers === true;
      if (silenced) offer = null;
      resetCache();
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
