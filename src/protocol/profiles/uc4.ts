// Faderfox UC4, firmware 02.05. Values and their confidence: docs/protocol/uc4-sysex.md
// (§1 framing, §2 slots, §3 setup block, §4 fader 9, §5 names, §6 value codes).
import type { CodeSpec, DeviceProfile, FieldSpec, PositionConfidence } from '../profile.ts';
import { MANUFACTURER_ID, RECORD_DATA_LENGTH, RECORD_PADDING } from '../frame.ts';
import type { Confidence, ControlKind } from '../types.ts';
import { buildFactoryDump } from './uc4Factory.ts';

const C: Confidence = 'confirmed';
const L: Confidence = 'likely';
const all = (c: Confidence): PositionConfidence => ({ first: c, last: c, between: c });
/** Push button, green button, fader: pairs at g1c1, g8c8 and, from the combined SE16 dump, g1c8 / g8c1 prove the group-major order (decision 14), so the controls between are confirmed too. */
const ends = (first: Confidence, last: Confidence): PositionConfidence => ({ first, last, between: first === C && last === C ? C : L });

/** Codes in list order (code = index + offset), all with one confidence unless `except` names others. */
function codes(names: readonly string[], base: Confidence, except: Record<string, Confidence> = {}, offset = 0): CodeSpec[] {
  return names.map((name, i) => ({ name, code: i + offset, confidence: except[name] ?? base }));
}

// Code tables: uc4-sysex.md §6.
const ENC_TYPE = codes(['CCr1', 'CCr2', 'CCAb', 'PrGC', 'CCAh', 'Pbnd', 'AFtt'], C);
const ENC_MODE = codes(['Acc0', 'Acc1', 'Acc2', 'Acc3'], C);
const ENC_DISPLAY = codes(['OFF', 'Std', 'bPoL'], C);
const PUSH_TYPE = codes(['OFF', 'notE', 'CC', 'PrGC', 'AFtt'], C);
const BTN_MODE = codes(['btn', 'toGL'], C);
const GREEN_TYPE = codes(['notE', 'CC', 'PrGC', 'AFtt'], C, {}, 1); // no OFF: code 0 is not a choice
const GREEN_DISPLAY = codes(['OFF', 'Std', 'EXt'], C);
const FADER_TYPE = codes(['CCAb', 'PrGC', 'Pbnd', 'AFtt'], C);
const FADER_MODE = codes(['JMP', 'SnAP'], C);
const FADER_DISPLAY = codes(['OFF', 'Std', 'bPoL'], C);
// Fader 9: a code is confirmed where a pair shows it as before or after value (SE16 groups 5–7; group 1: fad9g1-Pbnd/AFtt/bPoL).
const F9_TYPE = codes(['CCAb', 'PrGC', 'Pbnd', 'AFtt'], C);
const F9_MODE = codes(['JMP', 'SnAP'], C);
const F9_DISPLAY = codes(['OFF', 'Std', 'bPoL'], C);

type Conf = Record<'channel' | 'type' | 'number' | 'lower' | 'upper' | 'mode' | 'display', PositionConfidence>;

/** The properties of a kind in field order. `display` is absent for the push button (its +4 low nibble is `unknown`). */
function kind(control: ControlKind, t: { type: readonly CodeSpec[]; mode: readonly CodeSpec[]; display?: readonly CodeSpec[] }, conf: Conf): FieldSpec[] {
  const out: FieldSpec[] = [
    { control, property: 'channel', field: 0, nibble: 'low', confidence: conf.channel },
    { control, property: 'type', field: 0, nibble: 'high', codes: t.type, confidence: conf.type },
    { control, property: 'number', field: 1, nibble: 'byte', confidence: conf.number },
    { control, property: 'lower', field: 2, nibble: 'byte', confidence: conf.lower },
    { control, property: 'upper', field: 3, nibble: 'byte', confidence: conf.upper },
    { control, property: 'mode', field: 4, nibble: 'high', codes: t.mode, confidence: conf.mode },
  ];
  if (t.display) out.push({ control, property: 'display', field: 4, nibble: 'low', codes: t.display, confidence: conf.display });
  return out;
}

const FIELDS: FieldSpec[] = [
  // Encoder: layout proved by enc876g8-stride. The type nibble is confirmed at control 1 and, since enc8g8-CCr1 (a single-change
  // dump; combined-se16 had an extra byte there), at control 8: decision 12, between the ends a nibble is confirmed if both ends are.
  ...kind('encoder', { type: ENC_TYPE, mode: ENC_MODE, display: ENC_DISPLAY }, {
    channel: all(C), number: all(C), lower: all(C), upper: all(C), mode: all(C), display: all(C),
    type: ends(C, C),
  }),
  ...kind('pushButton', { type: PUSH_TYPE, mode: BTN_MODE }, {
    channel: ends(C, C), type: ends(C, C), number: ends(C, C), lower: ends(C, C), upper: ends(C, C), mode: ends(C, C), display: ends(L, L),
  }),
  // Green button mode: control 1 (btn1-toGL) and control 8 (combined-se16), decision 12.
  ...kind('greenButton', { type: GREEN_TYPE, mode: BTN_MODE, display: GREEN_DISPLAY }, {
    channel: ends(C, C), type: ends(C, C), number: ends(C, C), lower: ends(C, C), upper: ends(C, C), mode: ends(C, C), display: ends(C, C),
  }),
  // Fader display: control 1 (fad1-dispOFF) and control 8 (combined-se16), decision 12.
  ...kind('fader', { type: FADER_TYPE, mode: FADER_MODE, display: FADER_DISPLAY }, {
    channel: ends(C, C), type: ends(C, C), number: ends(C, C), lower: ends(C, C), upper: ends(C, C), mode: ends(C, C), display: ends(C, C),
  }),
];

const FADER9_FIELDS: FieldSpec[] = kind('fader', { type: F9_TYPE, mode: F9_MODE, display: F9_DISPLAY }, {
  channel: all(C), type: all(C), number: all(C), lower: all(C), upper: all(C), mode: all(C), display: all(C),
});

// Group-name characters (§5): code = index in this string. Codes in NAME_CONFIRMED were changed to or from in a pair;
// the others were only seen in factory names or follow the list order, so they are `likely`.
const NAME_CHARS = [...'0123456789abcdefghijlmnopqrstuxyz-_\'"= '];
// Every code: names-g1-4 and names-g5-8 (2026-11-16) changed all but `o` (0x17; the user set `a` where `o` was planned);
// `o` is confirmed by Faderfox's own list of the device's characters (2026-11-25, architect's OK), not by a pair.
const NAME_CONFIRMED = new Set(NAME_CHARS.map((_, code) => code));

export const faderfoxUc4: DeviceProfile = {
  id: 'faderfox-uc4',
  deviceName: 'UC4',
  // Port name and steps: docs/reference/uc4-device.md, "Setup mode".
  portName: 'Faderfox UC4',
  sendSteps: {
    one: [
      'Hold Shift and press Edit twice: setup mode, the Setup LED is lit.',
      'Turn encoder 1 to the setup to send (SE01…SE18).',
      'Hold the push button of encoder 4 until the bars have run: Sndc sends that setup.',
      'Shift aborts.',
    ],
    all: [
      'Hold Shift and press Edit twice: setup mode, the Setup LED is lit.',
      'Hold the push button of encoder 8 until the bars have run (Sn00…Sn99): SndA sends all 18 setups.',
      'Shift aborts.',
    ],
  },
  knownFirmware: ['02.05'],
  framing: {
    manufacturerId: MANUFACTURER_ID,
    recordDataLength: RECORD_DATA_LENGTH,
    padding: RECORD_PADDING,
    writeTypes: [0x02, 0x03],
    messageTypes: { 2: 'one', 3: 'all' },
    recordsPerMessage: { all: 430, one: 22 },
    messageLength: { all: 100640, one: 5072 },
    messageNames: { all: 'SndA', one: 'Sndc' },
    slotsPerMessage: { all: 18, one: 1 },
  },
  layout: {
    slotCount: 18,
    regions: [
      { name: 'groupNames', base: 0x1480, stride: 0x20, size: 32 },
      { name: 'fader9', base: 0x1700, stride: 0x40, size: 64 },
      { name: 'block', base: 0x1c00, stride: 0x500, size: 0x500 },
    ],
    fieldSize: 64,
    controls: {
      encoder: { firstField: 0, groups: 8, perGroup: 8 },
      pushButton: { firstField: 5, groups: 8, perGroup: 8 },
      greenButton: { firstField: 10, groups: 8, perGroup: 8 },
      fader: { firstField: 15, groups: 8, perGroup: 8 },
    },
    fader9: { groups: 8, recordSize: 5 },
    names: { groups: 8, chars: 4 },
    // Faderfox's three areas, 20 setups each (slots 19–20 are the device's internal copy slots): 20×8×4, 20×64 and 20×0x500 bytes.
    writeAreas: [
      { name: 'groupNames', from: 0x1480, to: 0x1480 + 20 * 8 * 4 },
      { name: 'crossfader', from: 0x1700, to: 0x1700 + 20 * 64 },
      { name: 'setupData', from: 0x1c00, to: 0x1c00 + 20 * 0x500 },
    ],
  },
  fields: FIELDS,
  fader9Fields: FADER9_FIELDS,
  nameCodes: NAME_CHARS.map((char, code) => ({ char, code, confidence: NAME_CONFIRMED.has(code) ? C : L })),
  // All 32: names-g1-4 and names-g5-8 changed a character at every position of groups 1–8.
  confirmedNamePositions: Array.from({ length: 8 }, (_, g) => [1, 2, 3, 4].map((c) => [g + 1, c] as const)).flat(),
  // Placement: the device wrote the addresses (six Sndc, factory match over 14 setups; decision 16). Move: untested (decision 7).
  slot: { placement: C, move: L },
  factoryDump: buildFactoryDump,
};
