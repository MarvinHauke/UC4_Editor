// Arrow keys between the drawn controls (plan 0006 decision 9): the nearest control in that direction,
// measured on the panel's own geometry. Pure, so it is tested without a component.
import type { ControlArea } from '../storage/index.ts';
import { GEOMETRY } from './profile/uc4Geometry.ts';

export interface ControlRef { area: ControlArea; index: number }
export type Direction = 'left' | 'right' | 'up' | 'down';

const AREAS: ControlArea[] = ['encoders', 'pushButtons', 'faders', 'buttons'];

/** The middle of a control's drawn shape. */
export function centre(area: ControlArea, index: number): { x: number; y: number } {
  const s = GEOMETRY[area][index]!;
  return s.shape === 'disc' ? { x: s.cx, y: s.cy } : { x: s.x + s.width / 2, y: s.y + s.height / 2 };
}

/** The control to move to from `from`, or null at the edge. Off-axis distance counts double. */
export function nextControl(from: ControlRef, direction: Direction): ControlRef | null {
  const here = centre(from.area, from.index);
  let best: { ref: ControlRef; score: number } | null = null;
  for (const area of AREAS) {
    GEOMETRY[area].forEach((_, index) => {
      if (area === from.area && index === from.index) return;
      const c = centre(area, index);
      const dx = c.x - here.x;
      const dy = c.y - here.y;
      const along = direction === 'right' ? dx : direction === 'left' ? -dx : direction === 'down' ? dy : -dy;
      const across = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
      if (along <= 1 || across > along * 1.5 + 30) return; // behind, or too far off to the side
      const score = along + 2 * across;
      if (!best || score < best.score) best = { ref: { area, index }, score };
    });
  }
  return best ? (best as { ref: ControlRef }).ref : null;
}
