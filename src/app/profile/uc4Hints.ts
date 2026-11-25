// How to set each property on the UC4 by hand (plan 0006 decision 16): from the encoder labels printed
// on the panel, edit mode: encoder 1 picks the control, encoders 2–8 set its properties
// (docs/reference/uc4-device.md). Device profile data.
import type { ControlArea } from '../../storage/index.ts';
import type { PropertyKey } from './uc4Properties.ts';

/** Edit encoder per property, with the label printed under it on the panel. */
export const EDIT_ENCODER: Record<PropertyKey, { encoder: number; label: string }> = {
  display: { encoder: 2, label: 'Disp scale' },
  type: { encoder: 3, label: 'Cmd type' },
  mode: { encoder: 4, label: 'Cmd mode' },
  channel: { encoder: 5, label: 'Cmd chan' },
  number: { encoder: 6, label: 'Cmd num' },
  lower: { encoder: 7, label: 'Lower value' },
  upper: { encoder: 8, label: 'Upper value' },
};

/** The control's name on the device's display in edit mode: `Enc3`, `Pbt3`, `FAd3`, `btn3`. */
const DISPLAY_NAME: Record<ControlArea, string> = { encoders: 'Enc', pushButtons: 'Pbt', faders: 'FAd', buttons: 'btn' };
export const deviceName = (area: ControlArea, index: number): string => `${DISPLAY_NAME[area]}${index + 1}`;

/** The short key sequence for one property of one control. */
export function deviceHint(area: ControlArea, index: number, property: PropertyKey): string {
  const { encoder, label } = EDIT_ENCODER[property];
  // Only what docs/reference/uc4-device.md says: how edit mode is entered, and which group it edits, is still to confirm.
  return `edit mode: encoder 1 to ${deviceName(area, index)}, then encoder ${encoder} (${label})`;
}
