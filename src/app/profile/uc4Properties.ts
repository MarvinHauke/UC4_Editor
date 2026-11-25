// The properties of each control kind, in the device's order (edit encoders 2–8, docs/reference/
// uc4-device.md), with the device's own words next to friendly ones. Device profile data.
import {
  BUTTON_MODES, ENCODER_DISPLAYS, ENCODER_MODES, ENCODER_TYPES, FADER_DISPLAYS, FADER_MODES, FADER_TYPES,
  GREEN_DISPLAYS, GREEN_TYPES, PUSH_TYPES,
} from '../../model/index.ts';
import type { ControlArea, ControlProperty } from '../../storage/index.ts';

export type PropertyKey = Exclude<ControlProperty, 'label'>;

export interface ChoiceField { key: PropertyKey; input: 'choice'; device: string; friendly: string; choices: readonly string[] }
export interface NumberField { key: PropertyKey; input: 'number'; device: string; friendly: string; min: number; max: number }
export type Field = ChoiceField | NumberField;

const choice = (key: PropertyKey, device: string, friendly: string, choices: readonly string[]): ChoiceField =>
  ({ key, input: 'choice', device, friendly, choices });
const number = (key: PropertyKey, device: string, friendly: string, min: number, max: number): NumberField =>
  ({ key, input: 'number', device, friendly, min, max });

const tail = [
  number('channel', 'Cmd chan', 'MIDI channel', 1, 16),
  number('number', 'Cmd num', 'Number', 0, 127),
  number('lower', 'Lower value', 'Lower value', 0, 127),
  number('upper', 'Upper value', 'Upper value', 0, 127),
];
const T = 'Cmd type';
const M = 'Cmd mode';

/** Per area, in the device's order. Push buttons have no display scale (the device shows `----`). */
export const FIELDS: Record<ControlArea, readonly Field[]> = {
  encoders: [
    choice('display', 'Disp scale', 'Display scale', ENCODER_DISPLAYS),
    choice('type', T, 'Command type', ENCODER_TYPES),
    choice('mode', M, 'Acceleration', ENCODER_MODES), ...tail,
  ],
  pushButtons: [choice('type', T, 'Command type', PUSH_TYPES), choice('mode', M, 'Button mode', BUTTON_MODES), ...tail],
  buttons: [
    choice('display', 'Disp scale', 'LED', GREEN_DISPLAYS),
    choice('type', T, 'Command type', GREEN_TYPES),
    choice('mode', M, 'Button mode', BUTTON_MODES), ...tail,
  ],
  faders: [
    choice('display', 'Disp scale', 'Display scale', FADER_DISPLAYS),
    choice('type', T, 'Command type', FADER_TYPES),
    choice('mode', M, 'Fader mode', FADER_MODES), ...tail,
  ],
};

/** The friendly words for a device value, shown after the device name: `CCr1 · relative 1/127`. */
export const VALUE_WORDS: Record<string, string> = {
  OFF: 'off', Std: 'standard 0–127', bPoL: 'bipolar −63…63', EXt: 'external only',
  CCr1: 'relative 1/127', CCr2: 'relative 63/65', CCAb: 'absolute 7-bit', PrGC: 'program change',
  CCAh: '14-bit, two CCs', Pbnd: 'pitch bend', AFtt: 'aftertouch',
  notE: 'note', CC: 'control change',
  Acc0: 'no acceleration', Acc1: 'low acceleration', Acc2: 'middle acceleration', Acc3: 'max acceleration',
  btn: 'momentary', toGL: 'toggle', SnAP: 'snap: catch the last value', JMP: 'jump: send at once',
};

/**
 * One line per command type (plan 0006 decision 29), from docs/reference/uc4-device.md "Values": what it sends,
 * and the name a DAW uses for it where there is one. The help line shows `line` (and `daw`); the how-to view reuses the table.
 */
export interface CommandTypeInfo { line: string; daw?: string }
export const COMMAND_TYPES: Record<string, CommandTypeInfo> = {
  CCr1: { line: 'relative, 1 = up, 127 = down', daw: 'Ableton: Relative (2\'s Comp.)' },
  CCr2: { line: 'relative, 65 = up, 63 = down', daw: 'Ableton: Relative (Binary Offset)' },
  CCAb: { line: 'control change, absolute 0–127' },
  PrGC: { line: 'program change 0–127' },
  CCAh: { line: '14-bit: number 0–31 = coarse (MSB), number + 32 = fine (LSB)' },
  Pbnd: { line: 'pitch bend, 14-bit 0–16383' },
  AFtt: { line: 'channel aftertouch 0–127' },
  notE: { line: 'note, number 0–127' },
  CC: { line: 'control change, number 0–127' },
  OFF: { line: 'sends nothing' },
};
/** The help-line text for a command type, or null for a value that isn't one. */
export function commandTypeLine(type: string): string | null {
  const info = COMMAND_TYPES[type];
  return info ? `${type}: ${info.line}${info.daw ? ` (${info.daw})` : ''}` : null;
}

export const AREA_NAMES: Record<ControlArea, { singular: string; short: string }> = {
  encoders: { singular: 'Encoder', short: 'Enc' },
  pushButtons: { singular: 'Push button', short: 'Pbt' },
  faders: { singular: 'Fader', short: 'FAd' },
  buttons: { singular: 'Green button', short: 'btn' },
};

/** The number shown for a control: 1-based, as printed on the panel. */
export const controlNumber = (index: number): number => index + 1;

/** The largest value a number field takes for this control: `CCAh` numbers are 0–31 (the LSB is number + 32). */
export function maxFor(field: NumberField, control: { type?: string }): number {
  return field.key === 'number' && control.type === 'CCAh' ? 31 : field.max;
}
