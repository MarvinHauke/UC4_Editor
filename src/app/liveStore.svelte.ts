// The monitor's state as Svelte state (plan 0008 step 1): the MIDI inputs and the live session, read by the monitor.
// Listening only. Later steps add matches and live values to the same store.
import { createLiveSession, type LiveSession, type MonitorRow } from '../live/index.ts';
import type { IgnoredCounts, InputInfo, InputSelection, ListenStatus, MidiInputs } from '../midi/inputs.ts';
import { loadSelection, saveSelection, type KeyValueStorage } from './monitorRows.ts';

export function createLive(inputs: MidiInputs, session: LiveSession = createLiveSession(), storage?: KeyValueStorage | null) {
  let rows = $state.raw<readonly MonitorRow[]>(session.rows);
  let list = $state.raw<readonly InputInfo[]>(inputs.inputs);
  let selection = $state.raw<InputSelection>(inputs.selection);
  let status = $state.raw<ListenStatus>(inputs.status);
  let clock = $state(inputs.ignored.clock > 0);

  inputs.select(loadSelection(storage)); // re-applied on load; an id that isn't plugged in keeps its choice and listens to nothing
  selection = inputs.selection;

  const stops = [
    inputs.onMessage((e) => { session.receive(e); }),
    session.subscribe(() => { rows = session.rows; }),
    inputs.subscribe(() => { list = inputs.inputs; selection = inputs.selection; status = inputs.status; clock = inputs.ignored.clock > 0; }),
  ];
  return {
    get rows() { return rows; },
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
export type { IgnoredCounts };
