// Editing rules: what the device does when a control changes (plan 0002 Q11).
import type { Encoder, Fader, GreenButton, PushButton } from './types.ts';

type AnyControl = Encoder | PushButton | GreenButton | Fader;

/**
 * Changes a control's type. Every other property is kept, also the ones the new type does not use,
 * so switching back brings them back. To `CCAh` a number above 31 is lowered to 31, as on the
 * device, and the message says so. Returns a new control; the old one is untouched.
 * One signature per kind, so a fader can never get an encoder's type.
 */
export function changeType(control: Encoder, type: Encoder['type']): { control: Encoder; message?: string };
export function changeType(control: PushButton, type: PushButton['type']): { control: PushButton; message?: string };
export function changeType(control: GreenButton, type: GreenButton['type']): { control: GreenButton; message?: string };
export function changeType(control: Fader, type: Fader['type']): { control: Fader; message?: string };
export function changeType(control: AnyControl, type: AnyControl['type']): { control: AnyControl; message?: string } {
  const changed = { ...control, type } as AnyControl;
  if (type === 'CCAh' && control.number > 31) {
    return {
      control: { ...changed, number: 31 },
      message: `CCAh numbers are 0–31 (the LSB is number + 32): the number was lowered from ${control.number} to 31.`,
    };
  }
  return { control: changed };
}
