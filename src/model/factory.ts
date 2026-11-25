// Factory setups, from the factory table in docs/reference/uc4-device.md.
// SE17/SE18 (Ableton) hold more exceptions than the manual's table prints; the rest comes from
// the factory SndA after rESA (dumps/2026-11-13-SndA-after-rESA.syx), see ABLETON_* below.
import type { Encoder, EncoderGroup, Fader, FaderButtonGroup, GreenButton, PushButton, Setup } from './types.ts';

const ENCODER_BASE = [8, 16, 24, 32, 72, 80, 88, 96];
const FADER_BASE = [32, 40, 48, 56, 104, 104, 104, 104];
const FADER9_NUMBER = 112;
// The manual's table does not give lower/upper; 0/127 is what the factory SndA holds (checked for all 18 slots).
const LOWER = 0;
const UPPER = 127;

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

/** The factory content of a setup slot 1–18; any other slot is a programming error. */
export function factorySetup(slot: number): Setup {
  if (!Number.isInteger(slot) || slot < 1 || slot > 18) {
    throw new RangeError(`factorySetup: no factory setup for slot ${slot} (1–18)`);
  }
  return slot <= 16 ? standardSetup(slot) : abletonSetup(slot);
}

function standardSetup(slot: number): Setup {
  const channel = slot;
  const encoderGroups: EncoderGroup[] = range(8).map((g) => ({
    // The device shows "GrP1"; names are stored lower case.
    name: `grp${g + 1}`,
    encoders: range(8).map((i): Encoder => ({
      display: 'Std', type: 'CCAb', mode: 'Acc3', channel, number: ENCODER_BASE[g]! + i, lower: LOWER, upper: UPPER,
    })),
    pushButtons: range(8).map((i): PushButton => ({
      type: 'notE', mode: 'btn', channel, number: g * 8 + i, lower: LOWER, upper: UPPER,
    })),
  }));
  const faderButtonGroups: FaderButtonGroup[] = range(8).map((g) => ({
    faders: range(9).map((i): Fader => ({
      display: 'Std', type: 'CCAb', mode: 'JMP', channel,
      number: i === 8 ? FADER9_NUMBER : FADER_BASE[g]! + i, lower: LOWER, upper: UPPER,
    })),
    buttons: range(8).map((i): GreenButton => ({
      display: 'Std', type: 'notE', mode: 'btn', channel, number: 64 + g * 8 + i, lower: LOWER, upper: UPPER,
    })),
  }));
  const label = String(slot).padStart(2, '0');
  return { id: `factory-se${label}`, name: `SE${label}`, slot, encoderGroups, faderButtonGroups };
}

// --- SE17 / SE18: Ableton Live 8/9 (tracks 1–8 and 9–16). ---
// Same content, but channel 13 in SE17 and 14 in SE18 wherever the table says `13/14`.
const ABLETON_ENCODER_BASE = [0, 8, 16, 24, 56, 48, 32, 56];
const ABLETON_BUTTON_BASE = [64, 72, 104, 96, 80, 88, 120, 56];
// [SE17, SE18] per group, as the table's `13/14` columns. SE18 group 6 is 13: a typo in the manual.
const ABLETON_ENCODER_CHANNEL = [[13, 14], [13, 14], [13, 14], [13, 14], [14, 14], [13, 13], [13, 14], [13, 13]];
const ABLETON_BUTTON_CHANNEL = [[13, 14], [13, 14], [13, 14], [13, 14], [13, 14], [13, 14], [14, 14], [13, 14]];
const ABLETON_NAMES = ['snd1', 'snd2', 'snd3', 'snd4', 'trac', 'rac ', 'pan ', 'glob'];
const ABLETON_FADER_BASE = 40;
const ABLETON_FADER9_NUMBER = 48;
const ABLETON_FADER9_CHANNEL = 14;

// Exceptions to the table's regular pattern, read from the factory SndA (same in both setups).
// [group, control, patch]; unlike `range`, both count from 1.
const ABLETON_ENCODER_EXCEPTIONS: [number, number, Partial<Encoder>][] = [
  [5, 4, { type: 'CCr1', mode: 'Acc0' }], [5, 5, { type: 'CCr1', mode: 'Acc0' }],
  [5, 6, { display: 'bPoL' }], [5, 7, { display: 'bPoL' }],
  ...range(8).map((n): [number, number, Partial<Encoder>] => [7, n + 1, { display: 'bPoL' }]),
  [8, 1, { type: 'CCr1', mode: 'Acc0' }], [8, 2, { type: 'CCr1', mode: 'Acc0' }],
  [8, 4, { type: 'CCr1', mode: 'Acc0' }], [8, 5, { type: 'CCr1', mode: 'Acc0' }],
];
const ABLETON_PUSH_EXCEPTIONS: [number, number, Partial<PushButton>][] = [
  [5, 3, { type: 'notE', number: 122, upper: 127 }], [5, 4, { type: 'notE', number: 123, upper: 127 }],
  ...range(8).map((n): [number, number, Partial<PushButton>] => [7, n + 1, { lower: 64, upper: 64 }]),
  ...range(8).map((n): [number, number, Partial<PushButton>] => [8, n + 1, { type: 'notE', number: 120 + n, upper: 127 }]),
];
// Group 7 green buttons are not in number order on the device.
const ABLETON_G7_BUTTON_NUMBERS = [123, 122, 127, 126, 124, 125, 120, 121];

function abletonSetup(slot: number): Setup {
  const c = slot - 4; // 13 in SE17, 14 in SE18
  const encoderGroups: EncoderGroup[] = range(8).map((g) => {
    const channel = ABLETON_ENCODER_CHANNEL[g]![slot - 17]!;
    return {
      name: ABLETON_NAMES[g]!,
      encoders: range(8).map((i): Encoder => ({
        display: 'Std', type: 'CCAb', mode: 'Acc3', channel, number: ABLETON_ENCODER_BASE[g]! + i, lower: LOWER, upper: UPPER,
        ...ABLETON_ENCODER_EXCEPTIONS.find(([eg, en]) => eg === g + 1 && en === i + 1)?.[2],
      })),
      // `OFF` push buttons keep the numbers the device holds (hidden values are kept) and upper 0.
      pushButtons: range(8).map((i): PushButton => ({
        type: 'OFF', mode: 'btn', channel, number: ABLETON_ENCODER_BASE[g]! + i, lower: LOWER, upper: 0,
        ...ABLETON_PUSH_EXCEPTIONS.find(([pg, pn]) => pg === g + 1 && pn === i + 1)?.[2],
      })),
    };
  });
  const faderButtonGroups: FaderButtonGroup[] = range(8).map((g) => ({
    faders: range(9).map((i): Fader => i === 8
      ? { display: 'Std', type: 'CCAb', mode: 'JMP', channel: ABLETON_FADER9_CHANNEL, number: ABLETON_FADER9_NUMBER, lower: LOWER, upper: UPPER }
      : { display: 'Std', type: 'CCAb', mode: 'SnAP', channel: c, number: ABLETON_FADER_BASE + i, lower: LOWER, upper: UPPER }),
    buttons: range(8).map((i): GreenButton => ({
      display: 'EXt', type: 'notE', mode: 'btn', channel: ABLETON_BUTTON_CHANNEL[g]![slot - 17]!,
      number: g === 6 ? ABLETON_G7_BUTTON_NUMBERS[i]! : ABLETON_BUTTON_BASE[g]! + i, lower: LOWER, upper: UPPER,
    })),
  }));
  return { id: `factory-se${slot}`, name: `SE${slot}`, slot, encoderGroups, faderButtonGroups };
}
