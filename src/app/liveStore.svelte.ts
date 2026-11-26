// The monitor's state as Svelte state (plan 0008 step 1): the MIDI inputs and the live session, read by the monitor.
// Listening only. Later steps add matches and live values to the same store.
import { getContext } from 'svelte';
import { createLiveSession, type ControlRef, type ControlState, type LiveContext, type LiveRow, type LiveSession, type MapTarget, type SwitchOffer, type TouchTarget } from '../live/index.ts';
import type { IgnoredCounts, InputInfo, InputSelection, ListenStatus, MidiInputs } from '../midi/inputs.ts';
import { loadSessionState, saveSessionState, type SessionStorageLike } from './liveSessionState.ts';
import { loadSelection, saveSelection, type KeyValueStorage } from './monitorRows.ts';

export function createLive(inputs: MidiInputs, session: LiveSession = createLiveSession(), storage?: KeyValueStorage | null, sessionStore?: SessionStorageLike | null) {
  let rows = $state.raw<readonly LiveRow[]>(session.rows);
  let states = $state.raw<ReadonlyMap<string, ControlState>>(session.controlStates);
  let armed = $state<string | null>(session.armed);
  let touchTarget = $state.raw<TouchTarget | null>(session.touchTarget);
  let offer = $state.raw<SwitchOffer | null>(session.offer);
  let silenced = $state(session.getState().silenceOffers);
  let touched = $state.raw<{ control: ControlRef; at: number } | null>(session.lastTouched);
  let list = $state.raw<readonly InputInfo[]>(inputs.inputs);
  let selection = $state.raw<InputSelection>(inputs.selection);
  let status = $state.raw<ListenStatus>(inputs.status);
  let clock = $state(inputs.ignored.clock > 0);

  inputs.select(loadSelection(storage)); // re-applied on load; an id that isn't plugged in keeps its choice and listens to nothing
  selection = inputs.selection;
  // "Don't ask again" lives as long as the tab: restored before the first message, saved after each change that alters them.
  session.restoreState(loadSessionState(sessionStore));
  let savedText = JSON.stringify(session.getState());
  const saveState = (): void => {
    const text = JSON.stringify(session.getState());
    if (text !== savedText) savedText = saveSessionState(session.getState(), sessionStore);
  };

  let lastContext: LiveContext | null = null;
  let sentContext = false;
  const stops = [
    inputs.onMessage((e) => { session.receive(e); }),
    session.subscribe(() => { saveState(); rows = session.rows; states = session.controlStates; touched = session.lastTouched; armed = session.armed; touchTarget = session.touchTarget; offer = session.offer; silenced = session.getState().silenceOffers; }),
    inputs.subscribe(() => { list = inputs.inputs; selection = inputs.selection; status = inputs.status; clock = inputs.ignored.clock > 0; }),
  ];
  return {
    get rows() { return rows; },
    /** What each control last did, by control id (`controlId(...)`); a control that never sent is not in the map: unknown. */
    get controlStates() { return states; },
    /** The control the last UC4 message was matched to; the device view lights it. */
    get lastTouched() { return touched; },
    /** The open setup and its two group selections; call whenever one of them or the configuration changes. */
    setContext(context: LiveContext | null): void {
      // Only when one of its four inputs changed: every call drops the open switch offer and rebuilds the match index.
      const same = context === null ? lastContext === null
        : lastContext !== null && lastContext.configuration === context.configuration && lastContext.setupId === context.setupId
          && lastContext.encoderGroup === context.encoderGroup && lastContext.faderButtonGroup === context.faderButtonGroup;
      if (same && sentContext) return;
      lastContext = context;
      sentContext = true;
      session.setContext(context);
    },
    pin(rowKey: string, controlId: string | null): void { session.pin(rowKey, controlId); },
    /** "The UC4 seems to be on encoder group 3 — switch?": set after 3 UC4 messages in a row that match only elsewhere; the UI only offers. */
    get offer() { return offer; },
    /** "Don't ask again" is on (until the tab closes). */
    get silenced() { return silenced; },
    /** The user said yes: gives the target once and clears the offer; the caller switches the selections. */
    acceptOffer(): SwitchOffer | null { return session.acceptOffer(); },
    /** "No": no offer for this target until the open setup changes; with `silence`, no more offers at all this session. */
    declineOffer(silence: boolean): void { session.dismissOffer(); if (silence) session.silenceOffers(true); },
    /** Map (steps 7 and 8): the armed row's key, and the control a UC4 message picked while armed. */
    get armed() { return armed; },
    get touchTarget() { return touchTarget; },
    armMap(rowKey: string): void { session.armMap(rowKey); },
    disarm(): void { session.disarm(); },
    mapPlan: ((...args: Parameters<LiveSession['mapPlan']>) => session.mapPlan(...args)) as LiveSession['mapPlan'],
    markMapped(rowKey: string, controlId: string | null): void { session.markMapped(rowKey, controlId); },
    nextUnmapped(rowKey?: string): LiveRow | null { return session.nextUnmapped(rowKey); },
    /** For every control of the open groups: can it take this row's message (dim the others). Reads `rows`, so a caller in a `$derived` updates. */
    mapTargets(rowKey: string): MapTarget[] { void rows; return session.mapTargets(rowKey); },
    get inputs() { return list; },
    get selection() { return selection; },
    get status() { return status; },
    /** True once MIDI clock arrived: the monitor says "MIDI clock ignored". */
    get clockIgnored() { return clock; },
    select(next: InputSelection): void { inputs.select(next); saveSelection(next, storage); },
    clear(): void { session.clear(); },
    connect: () => inputs.connect(),
    reconnect: () => inputs.reconnect(),
    dispose(): void { for (const s of stops) s(); inputs.dispose(); },
  };
}
export type Live = ReturnType<typeof createLive>;
export const LIVE_CONTEXT = Symbol('uc4-live');
export const useLive = (): Live => getContext<Live>(LIVE_CONTEXT);
export type { IgnoredCounts };
