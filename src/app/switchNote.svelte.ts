// After the user accepts the switch offer (plan 0008 decision 19): "Switched to encoder group 3 · Back" for a few seconds. The switch
// is ONE undo step; this note is its Back: it calls undo, so it only stays while that step is the last thing done (no other
// selection change and no edit since).
import { getContext } from 'svelte';
import type { SwitchOffer } from '../live/index.ts';

export interface Where { setupId: string; encoderGroup: number; faderButtonGroup: number }
export const SWITCH_NOTE_MS = 8000;

/** "Switched to SE05, encoder group 3, fader/button group 2": only what changed, in the device's numbering. */
export function switchedText(offer: SwitchOffer): string {
  const t = offer.target;
  const parts = offer.changes.map((c) => (c === 'setup' ? t.setupName : c === 'encoderGroup' ? `encoder group ${t.encoderGroup + 1}` : `fader/button group ${t.faderButtonGroup + 1}`));
  return `Switched to ${parts.join(', ')}`;
}

/** The short form for the status bar: "SE05 EG3 FG2?" (only what would change). */
export function offerShort(offer: SwitchOffer): string {
  const t = offer.target;
  const parts = offer.changes.map((c) => (c === 'setup' ? t.setupName : c === 'encoderGroup' ? `EG${t.encoderGroup + 1}` : `FG${t.faderButtonGroup + 1}`));
  return `${parts.join(' ')}?`;
}

/** What the switch offer and its Back note need, as one object in a context (App builds it): the monitor and the status bar show it. */
export interface SwitchUi {
  readonly offer: SwitchOffer | null;
  readonly note: { text: string } | null;
  accept(silence: boolean): void;
  decline(silence: boolean): void;
  back(): void;
}
export const SWITCH_CONTEXT = Symbol('uc4-switch');
export const useSwitch = (): SwitchUi => getContext<SwitchUi>(SWITCH_CONTEXT);

export const sameWhere = (a: Where, b: Where): boolean =>
  a.setupId === b.setupId && a.encoderGroup === b.encoderGroup && a.faderButtonGroup === b.faderButtonGroup;

export function createSwitchNote(options: { ms?: number } = {}) {
  const ms = options.ms ?? SWITCH_NOTE_MS;
  let note = $state.raw<{ text: string; target: Where; configuration: unknown } | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stop = (): void => { if (timer !== null) { clearTimeout(timer); timer = null; } };
  return {
    get note() { return note; },
    show(offer: SwitchOffer, configuration: unknown): void {
      stop();
      const t = offer.target;
      note = { text: switchedText(offer), configuration, target: { setupId: t.setupId, encoderGroup: t.encoderGroup, faderButtonGroup: t.faderButtonGroup } };
      timer = setTimeout(() => { note = null; timer = null; }, ms);
    },
    /** The selection and configuration now: any change other than the switch itself ends the note (Back would undo something else). */
    changed(now: Where, configuration: unknown): void { if (note && (!sameWhere(now, note.target) || configuration !== note.configuration)) { stop(); note = null; } },
    clear(): void { stop(); note = null; },
  };
}
export type SwitchNote = ReturnType<typeof createSwitchNote>;
