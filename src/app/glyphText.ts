// What a drawn control shows beside its command type (plan 0008, reviewer's proposal): the number the control really
// sends. A program change sends its Upper (a button) or Lower–Upper (an encoder or fader), not the number field; pitch bend
// and aftertouch have no number. Display only: nothing in the model changes.
import type { ControlArea } from '../storage/index.ts';

export interface GlyphControl { type: string; number: number; lower?: number; upper?: number }

export function glyphNumber(area: ControlArea, c: GlyphControl): string {
  switch (c.type) {
    case 'PrGC': {
      const button = area === 'buttons' || area === 'pushButtons';
      if (typeof c.upper !== 'number') return '';
      if (button || typeof c.lower !== 'number') return String(c.upper);
      return c.lower === c.upper ? String(c.upper) : `${c.lower}–${c.upper}`;
    }
    case 'Pbnd': case 'AFtt': return '';
    default: return String(c.number);
  }
}

/** Types whose number field the UC4 does not send (the property panel says so under the field). */
export const NUMBER_UNUSED_TYPES: readonly string[] = ['PrGC', 'Pbnd', 'AFtt'];
