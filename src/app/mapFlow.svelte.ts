// Map (plan 0008 steps 7 and 8, decisions 8 and 20): a monitor row is armed, then a click on a control or a message from the UC4
// picks the target; the edit is ONE undo entry (with the touched group's switch), a result line says what happened, the row
// remembers where it went and the next unmapped row is marked. The plan itself (what changes, what is refused) is `src/live`;
// this module only applies it. It never sends anything.
import { getContext } from 'svelte';
import { controlId, type LiveSession, type MapPlan, type TouchTarget } from '../live/index.ts';
import type { AnyControl, ControlAddress, ControlArea, SelectionChange } from '../storage/index.ts';

type PlanOk = Extract<MapPlan, { ok: true }>;

/** What the flow needs of the live store and of the library store (small, so tests can use stubs). */
export interface MapLive {
  readonly armed: string | null;
  readonly touchTarget: TouchTarget | null;
  armMap(rowKey: string): void;
  disarm(): void;
  mapPlan: LiveSession['mapPlan'];
  markMapped(rowKey: string, controlId: string | null): void;
  nextUnmapped(rowKey?: string): { key: string } | null;
}
export interface MapStore {
  readonly state: { configuration: unknown; selection: { setupId: string; encoderGroup: number; faderButtonGroup: number; control?: { area: ControlArea; index: number } | null } };
  /** A refusal comes back with a `message` and changes nothing. */
  setControl(address: ControlAddress, control: AnyControl, selection?: SelectionChange): { message?: string } | undefined | unknown;
  selectControl(control: { area: ControlArea; index: number }): unknown;
  undo(): unknown;
}

export interface MapResult {
  /** "FAd3 · FG2 now sends CC 74 ch 2" or a refusal. */
  text: string;
  /** "also sent by Enc3 · EG1": controls that now send the same message (allowed; decision 8). */
  alsoSentBy: string[];
  /** The model's notes about the type change. */
  notes: string[];
  /** True when nothing was applied because the library refused it (or the plan did). */
  error: boolean;
  /** False when no undo entry was made (the control already sent this and the selection stayed): Undo would undo something else. */
  undoable: boolean;
  /** Where the row went, for Undo to forget it. */
  rowKey: string | null;
  /** The configuration after the edit: a later change ends the line, because Undo would undo something else. */
  configuration: unknown;
}

export const RESULT_MS = 12000;

export function createMapFlow(options: {
  live: MapLive;
  store: () => MapStore | null;
  spotRelative: () => boolean;
  /** After a CC went onto a button: open the property panel with Upper focused (decision 17). */
  focusUpper: () => void;
  ms?: number;
}) {
  const { live } = options;
  const ms = options.ms ?? RESULT_MS;
  let result = $state.raw<MapResult | null>(null);
  /** The row to work on next (the next unmapped one), marked in the list. */
  let nextKey = $state<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stop = (): void => { if (timer !== null) { clearTimeout(timer); timer = null; } };
  const show = (r: MapResult): void => { stop(); result = r; timer = setTimeout(() => { result = null; timer = null; }, ms); };

  function apply(rowKey: string, plan: MapPlan, selection: SelectionChange): void {
    const store = options.store();
    if (!store) return;
    if (!plan.ok) { show({ text: plan.reason, alsoSentBy: [], notes: [], error: true, undoable: false, rowKey: null, configuration: null }); return; }
    const p: PlanOk = plan;
    const e = p.edit;
    const address: ControlAddress = { setupId: e.setupId, area: e.area, group: e.group, index: e.index };
    const before = store.state;
    const place = (x: MapStore['state']) => `${x.selection.setupId}|${x.selection.encoderGroup}|${x.selection.faderButtonGroup}|${x.selection.control?.area ?? ''}|${x.selection.control?.index ?? ''}`;
    const was = { configuration: before.configuration, place: place(before) };
    const answer = store.setControl(address, e.control, selection) as { message?: string } | undefined;
    // The library refuses with a message and changes nothing: say so, claim no edit, keep Map armed to pick another control.
    if (answer && typeof answer === 'object' && typeof answer.message === 'string' && answer.message !== '') {
      show({ text: answer.message, alsoSentBy: [], notes: [], error: true, undoable: false, rowKey: null, configuration: null });
      return;
    }
    // A control that already sends the message makes no undo entry (unless the selection moved): then there is nothing to undo.
    const after = store.state;
    const undoable = after.configuration !== was.configuration || place(after) !== was.place;
    live.markMapped(rowKey, controlId(e.setupId, e.area, e.group, e.index));
    nextKey = live.nextUnmapped(rowKey)?.key ?? null;
    live.disarm();
    show({
      text: undoable ? p.resultText : p.resultText.replace(' now sends ', ' already sends '),
      alsoSentBy: p.alsoSentBy, notes: p.notes, error: false, undoable, rowKey, configuration: after.configuration,
    });
    if (p.focusUpper) queueMicrotask(options.focusUpper);
  }

  return {
    get result() { return result; },
    get nextKey() { return nextKey; },
    get armed() { return live.armed; },
    /** The row's Map button: arms it, or cancels when it is the armed one. */
    toggle(rowKey: string): void {
      if (live.armed === rowKey) { live.disarm(); return; }
      stop(); result = null;
      live.armMap(rowKey);
    },
    /** Esc, Map again, a click on empty space. */
    cancel(): void { live.disarm(); },
    /** A click on a control of the open groups while armed: true when the click was taken (so the editor does not also select it). */
    click(area: ControlArea, index: number): boolean {
      const rowKey = live.armed;
      const store = options.store();
      if (rowKey === null || !store) return false;
      const sel = store.state.selection;
      const group = area === 'encoders' || area === 'pushButtons' ? sel.encoderGroup : sel.faderButtonGroup;
      const plan = live.mapPlan(rowKey, controlId(sel.setupId, area, group, index), { spotRelative: options.spotRelative() });
      apply(rowKey, plan, { control: { area, index } });
      return true;
    },
    /** Map by touch: call when `touchTarget` appears; the plan is made before disarming, the group switch is part of the same undo entry. */
    touch(): void {
      const rowKey = live.armed;
      const t = live.touchTarget;
      if (rowKey === null || !t) return;
      const plan = live.mapPlan(rowKey, t.control.id, { spotRelative: options.spotRelative() });
      apply(rowKey, plan, { ...t.switch, control: { area: t.control.area, index: t.control.index } });
    },
    undo(): void {
      const r = result;
      stop(); result = null;
      if (!r?.undoable) return;
      if (r.rowKey) live.markMapped(r.rowKey, null);
      nextKey = null;
      options.store()?.undo();
    },
    /** The configuration now: any change other than the mapping itself ends the result line. */
    changed(configuration: unknown): void {
      if (result && !result.error && configuration !== result.configuration) { stop(); result = null; }
    },
    dismiss(): void { stop(); result = null; },
  };
}
export type MapFlow = ReturnType<typeof createMapFlow>;

/** What the components read and call: the flow and, while Map is armed, which control of the open groups can take the row's message. */
export interface MapUi {
  readonly flow: MapFlow;
  /** Control id → can it take the armed row's message, and the help-line reason when not. Empty while not armed. */
  readonly targets: ReadonlyMap<string, { ok: boolean; reason: string | null }>;
}
export const MAP_CONTEXT = Symbol('uc4-map');
export const useMap = (): MapUi => getContext<MapUi>(MAP_CONTEXT);
