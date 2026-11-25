// The published JSON Schema for uc4-config files, built from the same constants as the types, so
// the two cannot drift (a test compares the committed file with this). Draft-07, which the JSON
// language servers in editors (vscode-json-languageserver, nvim) understand.
// What a schema cannot say stays with validate: unique ids and slots, ISO date validity.
import {
  BUTTON_MODES, ENCODER_DISPLAYS, ENCODER_MODES, ENCODER_TYPES, FADER_DISPLAYS, FADER_MODES, FADER_TYPES,
  FORMAT, GREEN_DISPLAYS, GREEN_TYPES, PUSH_TYPES, SCHEMA_VERSION,
} from './types.ts';
import { NAME_PATTERN } from './names.ts';

type Json = Record<string, unknown>;
const ref = (name: string): Json => ({ $ref: `#/definitions/${name}` });
const choice = (values: readonly string[], description: string): Json => ({ enum: [...values], description });
const whole = (min: number, max: number, description: string): Json => ({ type: 'integer', minimum: min, maximum: max, description });
const text = (description: string): Json => ({ type: 'string', description });

const channel = whole(1, 16, 'MIDI channel as on the display, 1–16.');
const number = whole(0, 127, 'Command number, 0–127 (with CCAh 0–31).');
const lower = whole(0, 127, 'Lower value, 0–127; not used by relative types. Lower above upper inverts the control.');
const upper = whole(0, 127, 'Upper value, 0–127; not used by relative types. For buttons: press/on.');
const label = text('Your own name for this, e.g. "Cutoff". Editor-only; never sent to the device.');

function control(description: string, display: readonly string[] | null, type: readonly string[], mode: readonly string[], extra: Json = {}): Json {
  const properties: Json = {
    label,
    ...(display ? { display: choice(display, 'Display scale (edit encoder 2). Green buttons: the LED.') } : {}),
    type: choice(type, 'Command type (edit encoder 3).'),
    mode: choice(mode, 'Command mode (edit encoder 4).'),
    channel, number, lower, upper,
  };
  return {
    type: 'object', description, additionalProperties: false,
    required: Object.keys(properties).filter((k) => k !== 'label'),
    properties,
    ...extra,
  };
}

const list = (item: string, length: number, description: string): Json => ({
  type: 'array', description, minItems: length, maxItems: length, items: ref(item),
});

export function buildSchema(): Json {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'UC4 Editor configuration',
    description: 'Setups of a Faderfox UC4, in the device\'s own words. Written by the UC4 Editor; safe to edit by hand.',
    type: 'object',
    additionalProperties: false,
    required: ['format', 'schemaVersion', 'device', 'createdAt', 'updatedAt', 'setups'],
    properties: {
      $schema: text('Path or URL of this schema; lets the editor check the file as you type.'),
      format: { const: FORMAT, description: `Always "${FORMAT}".` },
      schemaVersion: { const: SCHEMA_VERSION, description: 'Version of this file format.' },
      device: {
        type: 'object', additionalProperties: false, required: ['profile'],
        properties: { profile: { const: 'faderfox-uc4', description: 'The device this is for.' }, firmware: text('Firmware version the setups were read from, e.g. "02.05".') },
      },
      createdAt: { type: 'string', format: 'date-time', description: 'ISO 8601 with seconds, e.g. 2026-11-13T10:00:00Z.' },
      updatedAt: { type: 'string', format: 'date-time', description: 'ISO 8601 with seconds, e.g. 2026-11-13T10:00:00Z.' },
      setups: { type: 'array', minItems: 1, maxItems: 18, items: ref('setup'), description: '1 to 18 setups.' },
    },
    definitions: {
      setup: {
        type: 'object', additionalProperties: false,
        required: ['id', 'name', 'encoderGroups', 'faderButtonGroups'],
        description: 'One UC4 setup: 8 encoder groups and 8 fader/button groups, chosen independently on the device.',
        properties: {
          id: text('Editor-only identifier, unique in this file.'),
          name: text('Your name for the setup, e.g. "Live Mixing".'),
          notes: text('Your notes. Editor-only.'),
          slot: whole(1, 18, 'Device slot SE01–SE18 this setup belongs to; at most one setup per slot.'),
          encoderGroups: list('encoderGroup', 8, '8 encoder groups; position = group number − 1.'),
          faderButtonGroups: list('faderButtonGroup', 8, '8 fader/button groups; position = group number − 1.'),
        },
      },
      encoderGroup: {
        type: 'object', additionalProperties: false, required: ['name', 'encoders', 'pushButtons'],
        description: 'Encoder group: 8 encoders and their 8 push buttons, with a 4-character name.',
        properties: {
          name: {
            type: 'string', pattern: NAME_PATTERN,
            description: 'Exactly 4 characters the UC4 can show: 0–9, a–j, l–u, x, y, z (no k, v, w; lower case), - _ = \' " and space.',
          },
          label,
          encoders: list('encoder', 8, 'Enc1…Enc8.'),
          pushButtons: list('pushButton', 8, 'Pbt1…Pbt8.'),
        },
      },
      faderButtonGroup: {
        type: 'object', additionalProperties: false, required: ['faders', 'buttons'],
        description: 'Fader/button group: 9 faders and 8 green buttons. The device gives it no name.',
        properties: {
          label,
          faders: list('fader', 9, 'FAd1…FAd9 (9 is the horizontal one).'),
          buttons: list('greenButton', 8, 'btn1…btn8.'),
        },
      },
      encoder: control('An encoder.', ENCODER_DISPLAYS, ENCODER_TYPES, ENCODER_MODES, {
        if: { properties: { type: { const: 'CCAh' } }, required: ['type'] },
        then: { properties: { number: whole(0, 31, 'CCAh numbers are 0–31 (the LSB is number + 32).') } },
      }),
      pushButton: control('An encoder push button. It has no display scale.', null, PUSH_TYPES, BUTTON_MODES),
      greenButton: control('A green button with LED. It has no OFF type.', GREEN_DISPLAYS, GREEN_TYPES, BUTTON_MODES),
      fader: control('A fader.', FADER_DISPLAYS, FADER_TYPES, FADER_MODES),
    },
  };
}
