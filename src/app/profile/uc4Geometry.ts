// UC4 panel geometry for the SVG device view (device profile data, plan 0006). Coordinates are in
// the viewBox below, taken from the panel schematic docs/reference/uc4-panel.svg. Data only: another
// Faderfox device adds a file like this one, not code.
import type { ControlArea } from '../../storage/index.ts';

// The two areas are two SVGs with the same scale, so each gets its own ‹ › beside it (plan 0006 decision 19).
export const VIEWS = {
  upper: { x: 0, y: 10, width: 560, height: 312 },
  lower: { x: 0, y: 322, width: 560, height: 436 },
} as const;
/** Height of both areas together, in viewBox units (for fitting the view into its column). */
export const TOTAL_HEIGHT = VIEWS.upper.height + VIEWS.lower.height;
/** For the CSS fit: both areas together in viewBox units. */
export const AREA_FIT = { units: TOTAL_HEIGHT } as const;
/** The smallest scale at which the smallest click target (the push-button pill) is still 24 px. */
export const MIN_SCALE = 0.8;

export interface Disc { shape: 'disc'; cx: number; cy: number; r: number }
export interface Pill { shape: 'pill'; x: number; y: number; width: number; height: number }
/** A fader: its track, and a hit box around the whole travel. */
export interface FaderShape { shape: 'fader'; x: number; y: number; width: number; height: number; horizontal: boolean }
export type ControlShape = Disc | Pill | FaderShape;

const ENCODER_X = [80, 213, 346, 479];
const ENCODER_Y = [72, 246];
const FADER_X = [52, 117, 182, 247, 312, 377, 442, 507];

const encoders: Disc[] = Array.from({ length: 8 }, (_, i) => ({
  shape: 'disc', cx: ENCODER_X[i % 4]!, cy: ENCODER_Y[Math.floor(i / 4)]!, r: 36,
}));
// The push button sits under its encoder (on the device it is the encoder's own push action).
const pushButtons: Pill[] = encoders.map((e) => ({
  shape: 'pill', x: e.cx - 38, y: e.cy + 38, width: 76, height: 30,
}));
const faders: FaderShape[] = [
  ...FADER_X.map((x): FaderShape => ({ shape: 'fader', x: x - 24, y: 340, width: 48, height: 186, horizontal: false })),
  { shape: 'fader', x: 170, y: 592, width: 220, height: 56, horizontal: true },
];
const buttons: Disc[] = FADER_X.map((x) => ({ shape: 'disc', cx: x, cy: 726, r: 26 }));

/** The crossfader is fader 9 (index 8): one wide control that does not slide with its group. */
export const CROSSFADER = 8;

/** How far a group slide travels: the spacing of the area's own controls (encoder 1 to 2, fader 1 to 2). */
export function groupPitch(part: 'upper' | 'lower'): number {
  const [a, b] = part === 'upper' ? ENCODER_X : FADER_X;
  return b! - a!;
}

export const GEOMETRY: Record<ControlArea, ControlShape[]> = { encoders, pushButtons, faders, buttons };

/** Where each control's "type number" text sits, as the centre of the text block. */
export function textAnchor(area: ControlArea, index: number): { x: number; y: number } {
  const s = GEOMETRY[area][index]!;
  if (s.shape === 'disc') return { x: s.cx, y: s.cy };
  if (s.shape === 'pill') return { x: s.x + s.width / 2, y: s.y + s.height / 2 };
  return s.horizontal ? { x: s.x + s.width / 2, y: s.y + s.height + 16 } : { x: s.x + s.width / 2, y: s.y + s.height + 18 };
}

/** The group LEDs: one above each green button, lit in the group colour for the fader/button group on show. */
export const GROUP_LED = { y: 692, r: 6 } as const;
export const GROUP_LED_X: readonly number[] = FADER_X;

/** Fixed furniture: the display frame and the buttons that only explain the device (not active). */
export const FRAMES = {
  upperArea: { x: 16, y: 16, width: 528, height: 304 },
  lowerArea: { x: 16, y: 324, width: 528, height: 432 },
  display: { x: 200, y: 144, width: 160, height: 46 },
  editSetup: { cx: 91, cy: 628, r: 26, ledAx: 64, ledBx: 118, ledY: 582 },
  shift: { cx: 470, cy: 628, r: 26 },
} as const;
