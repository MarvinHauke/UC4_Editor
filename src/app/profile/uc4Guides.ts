// The UC4's guides (plan 0005 decision 35), from docs/reference/uc4-device.md "Setup mode": which controls stay undimmed,
// the numbered callouts beside them and what the panel shows. Positions are viewBox units of the drawn panel
// (uc4Geometry.ts, FRAMES). Device profile data: the Sndc/SndA help can reuse it.
import type { GuideData } from '../guide.ts';
import { FRAMES, GEOMETRY, type Disc } from './uc4Geometry.ts';

const enc7 = GEOMETRY.encoders[6] as Disc;
const { shift, editSetup } = FRAMES;

/** Put the UC4 in receive mode `rEc` (setup mode, encoder 7): Shift, Edit twice, then hold encoder 7 until `rc00`. */
export const RECEIVE_GUIDE: GuideData = {
  spots: [
    // Shift with its label; Edit and Setup with their LEDs and labels; encoder 7 with its push button; the display (shows rEc).
    { part: 'lower', x: shift.cx - 31, y: 588, width: 62, height: 76, rx: 14 },
    { part: 'lower', x: editSetup.cx - 52, y: 568, width: 104, height: 96, rx: 14 },
    { part: 'upper', x: 296, y: 194, width: 100, height: 118, rx: 16 },
    { part: 'upper', x: 194, y: 138, width: 172, height: 58, rx: 8 },
  ],
  callouts: [
    { n: 1, part: 'lower', x: 404, y: 478, width: 136, height: 34, lines: [['Hold ', { key: 'Shift' }]], pointer: { x1: shift.cx, y1: 512, x2: shift.cx, y2: 582 } },
    { n: 2, part: 'lower', x: 16, y: 462, width: 190, height: 58, lines: [['Press ', { key: 'Edit' }, ' twice:'], ['Setup LED on']], pointer: { x1: editSetup.cx, y1: 520, x2: editSetup.cx, y2: 564 } },
    { n: 3, part: 'upper', x: 52, y: 220, width: 240, height: 58, lines: [['Hold encoder ', { key: '7' }, ': ', { key: 'rEc' }, ','], ['keep holding until ', { key: 'rc00' }]], pointer: { x1: 292, y1: 249, x2: enc7.cx - enc7.r, y2: enc7.cy } },
  ],
  cues: [{ kind: 'setupLed' }, { kind: 'display', text: 'rEc' }, { kind: 'shift' }, { kind: 'edit' }],
  lit: [{ area: 'encoders', index: 6 }, { area: 'pushButtons', index: 6 }],
};

/** Which dump the user will send from the UC4: one setup (`Sndc`, encoder 4) or all of them (`SndA`, encoder 8). */
export type SendChoice = 'one' | 'all';

/**
 * Send a dump from the UC4 (plan 0010 decision 6): Shift, Edit twice, (`Sndc`: turn encoder 1 to the setup), then hold encoder 4's
 * (`Sndc`) or 8's (`SndA`) push button until the bars have run. Steps 1 and 2 are the receive guide's. Callouts are numbered
 * without a gap, so `SndA` has three.
 */
export function sendGuide(choice: SendChoice): GuideData {
  const lowerSteps = RECEIVE_GUIDE.callouts.filter((c) => c.part === 'lower');
  const lowerSpots = RECEIVE_GUIDE.spots.filter((s) => s.part === 'lower');
  const displaySpot = RECEIVE_GUIDE.spots.find((s) => s.part === 'upper' && s.y < 150)!;
  const enc1 = GEOMETRY.encoders[0] as Disc;
  const hold = (n: number, encoder: 4 | 8, y: number, enc: Disc): GuideData['callouts'][number] => ({
    n, part: 'upper', x: 180, y, width: 250, height: 58,
    lines: [['Hold encoder ', { key: String(encoder) }, "'s push button"], ['until the bars have run']],
    pointer: { x1: 430, y1: y + 29, x2: enc.cx - 38, y2: enc.cy + 53 },
  });
  if (choice === 'one') {
    const enc4 = GEOMETRY.encoders[3] as Disc;
    return {
      spots: [...lowerSpots, { part: 'upper', x: enc1.cx - 42, y: 30, width: 84, height: 80, rx: 14 }, { part: 'upper', x: enc4.cx - 42, y: 30, width: 84, height: 116, rx: 14 }, displaySpot],
      callouts: [
        ...lowerSteps,
        { n: 3, part: 'upper', x: 128, y: 36, width: 240, height: 34, lines: [['Turn encoder ', { key: '1' }, ' to the setup']], pointer: { x1: 128, y1: 53, x2: enc1.cx + enc1.r, y2: enc1.cy } },
        hold(4, 4, 80, enc4),
      ],
      cues: [{ kind: 'setupLed' }, { kind: 'display', text: 'Sndc' }, { kind: 'shift' }, { kind: 'edit' }],
      lit: [{ area: 'encoders', index: 0 }, { area: 'pushButtons', index: 3 }],
    };
  }
  const enc8 = GEOMETRY.encoders[7] as Disc;
  return {
    spots: [...lowerSpots, { part: 'upper', x: enc8.cx - 42, y: 204, width: 84, height: 112, rx: 14 }, displaySpot],
    callouts: [...lowerSteps, hold(3, 8, 192, enc8)],
    cues: [{ kind: 'setupLed' }, { kind: 'display', text: 'SndA' }, { kind: 'shift' }, { kind: 'edit' }],
    lit: [{ area: 'pushButtons', index: 7 }],
  };
}
