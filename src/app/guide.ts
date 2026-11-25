// A guide on the drawn panel (plan 0005 decision 35): the device view is dimmed except a few controls, numbered callouts
// stand beside them, and a card in the middle asks for the action. Plain data; the profile supplies the positions
// (viewBox units of the drawn panel), the Send and Restore dialogs use it for `rEc`, `Sndc`/`SndA` help can reuse it.
/** A callout's text: plain words and key words shown in bold. */
export type Chunk = string | { key: string };

export interface GuideCallout {
  n: number;
  /** Which of the two drawn areas it sits in; positions are in that area's viewBox units. */
  part: 'upper' | 'lower';
  x: number; y: number; width: number; height: number;
  /** At most two lines. */
  lines: readonly (readonly Chunk[])[];
  /** From the callout to the control it names. */
  pointer: { x1: number; y1: number; x2: number; y2: number };
}

/** A part of the panel that stays undimmed (invisible: it only lifts the dim). */
export interface GuideSpot { part: 'upper' | 'lower'; x: number; y: number; width: number; height: number; rx: number }

/** What the drawn panel shows besides the dimming: the Setup LED lit, the display's text, and the buttons that carry the accent outline. */
export type GuideCue = { kind: 'setupLed' } | { kind: 'display'; text: string } | { kind: 'shift' } | { kind: 'edit' };

/** The panel's part of a guide: what is dimmed, what is called out, what is lit. */
export interface GuideData {
  callouts: readonly GuideCallout[];
  spots: readonly GuideSpot[];
  cues: readonly GuideCue[];
  /** Drawn controls that carry the accent outline themselves (no box around them). */
  lit: readonly { area: 'encoders' | 'pushButtons'; index: number }[];
}

/** The small card in the middle of the device view: the question and its two buttons. */
export interface GuideCard {
  text: string;
  confirmLabel: string;
  /** Send / Restore is possible (a plan exists and the UC4 is connected). */
  canConfirm: boolean;
  onconfirm: () => void;
  oncancel: () => void;
}
