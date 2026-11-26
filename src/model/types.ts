// The UC4 Configuration Schema, version 1 (plan 0002). The contract every other area builds on;
// only uc4-model edits this file. Vocabulary is the device's own (docs/reference/uc4-device.md).

export const FORMAT = 'uc4-config' as const;
export const SCHEMA_VERSION = 1 as const;

export const ENCODER_DISPLAYS = ['OFF', 'Std', 'bPoL'] as const;
export const ENCODER_TYPES = ['CCr1', 'CCr2', 'CCAb', 'PrGC', 'CCAh', 'Pbnd', 'AFtt'] as const;
export const ENCODER_MODES = ['Acc0', 'Acc1', 'Acc2', 'Acc3'] as const;
export const PUSH_TYPES = ['OFF', 'notE', 'CC', 'PrGC', 'AFtt'] as const;
export const BUTTON_MODES = ['btn', 'toGL'] as const;
export const GREEN_DISPLAYS = ['OFF', 'Std', 'EXt'] as const;
// Green buttons have no `OFF` type on the device, whatever the manual says (plan 0002, decisions).
export const GREEN_TYPES = ['notE', 'CC', 'PrGC', 'AFtt'] as const;
export const FADER_DISPLAYS = ['OFF', 'Std', 'bPoL'] as const;
export const FADER_TYPES = ['CCAb', 'PrGC', 'Pbnd', 'AFtt'] as const;
export const FADER_MODES = ['JMP', 'SnAP'] as const;

/** MIDI channel as on the display: integer 1–16. */
export type Ch = number;
/** Number, lower or upper value: integer 0–127. */
export type V = number;

// Every control holds every property the device has for its kind, whatever its type (flat).
export interface Encoder {
  label?: string;
  display: (typeof ENCODER_DISPLAYS)[number];
  type: (typeof ENCODER_TYPES)[number];
  mode: (typeof ENCODER_MODES)[number];
  channel: Ch;
  number: V;
  lower: V;
  upper: V;
}
export interface PushButton {
  label?: string;
  type: (typeof PUSH_TYPES)[number];
  mode: (typeof BUTTON_MODES)[number];
  channel: Ch;
  number: V;
  lower: V;
  upper: V;
}
export interface GreenButton {
  label?: string;
  display: (typeof GREEN_DISPLAYS)[number];
  type: (typeof GREEN_TYPES)[number];
  mode: (typeof BUTTON_MODES)[number];
  channel: Ch;
  number: V;
  lower: V;
  upper: V;
}
export interface Fader {
  label?: string;
  display: (typeof FADER_DISPLAYS)[number];
  type: (typeof FADER_TYPES)[number];
  mode: (typeof FADER_MODES)[number];
  channel: Ch;
  number: V;
  lower: V;
  upper: V;
}

/** Position in each array = control or group number − 1. */
export interface EncoderGroup {
  /** Exactly 4 characters from the device's list, lower case. */
  name: string;
  label?: string;
  encoders: Encoder[]; // 8
  pushButtons: PushButton[]; // 8
}
export interface FaderButtonGroup {
  label?: string;
  faders: Fader[]; // 9
  buttons: GreenButton[]; // 8
}

export interface Setup {
  /** Editor-only; unique within the configuration. */
  id: string;
  name: string;
  notes?: string;
  /** 1–18; at most one setup per slot. */
  slot?: number;
  encoderGroups: EncoderGroup[]; // 8
  faderButtonGroups: FaderButtonGroup[]; // 8
}

export interface Uc4Config {
  /** Optional pointer to the published JSON Schema, so a text editor can check the file as you type. */
  $schema?: string;
  format: typeof FORMAT;
  schemaVersion: typeof SCHEMA_VERSION;
  device: { profile: 'faderfox-uc4'; firmware?: string };
  createdAt: string; // ISO 8601
  updatedAt: string;
  setups: Setup[]; // 1–n
}

/** A value problem: where it is, and what is wrong. */
export interface Problem {
  path: string;
  message: string;
}

export type LoadResult =
  | { status: 'refused'; reason: string; whatToDo: string }
  | { status: 'loaded'; configuration: Uc4Config; problems: Problem[] };

/** The kinds of channel message the editor names; the live module uses the same names. */
export type MessageKind = 'cc' | 'note' | 'program' | 'pitchBend' | 'aftertouch' | 'polyAftertouch';

/** One message a control can send: kind, channel and number. `pitchBend` and `aftertouch` have no number
 *  (they collide by channel); for `program` the number is the program. A control may send several keys
 *  (`CCAh` sends CC n and n + 32; a `PrGC` range sends every program from lower to upper). */
export interface MessageKey {
  kind: MessageKind;
  channel: Ch;
  number?: V;
}

/** Something that may be a mistake but is allowed (glossary: Warning): two controls of one setup that can play
 *  together and send the same message. Never blocks a send. */
export interface Warning {
  setupId: string;
  /** The setup's slot (1–18), when it has one. */
  slot?: number;
  /** The two controls, as the paths `validate` uses (`setups[2].encoderGroups[0].encoders[3]`). */
  controls: [string, string];
  key: MessageKey;
  /** E.g. "Enc3 · EG1 and FAd5 · FG2 both send CC 10 ch 1". */
  message: string;
}
