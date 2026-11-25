import { describe, expect, it } from 'vitest';
import { editDisplayText } from '../../src/app/profile/uc4Display.ts';
import { GLYPHS } from '../../src/app/profile/uc4Segments.ts';

const enc = { display: 'Std', type: 'CCAb', mode: 'Acc3', channel: 5, number: 64, lower: 0, upper: 127 };

describe('editDisplayText', () => {
  it('shows the control name when no property is focused', () => {
    expect(editDisplayText('encoders', 2, enc, null)).toBe('Enc3');
    expect(editDisplayText('pushButtons', 0, enc, null)).toBe('Pbt1');
    expect(editDisplayText('faders', 8, enc, null)).toBe('FAd9');
    expect(editDisplayText('buttons', 7, enc, null)).toBe('btn8');
  });
  it('shows a focused property as the device writes it', () => {
    expect(editDisplayText('encoders', 0, enc, 'display')).toBe('Std');
    expect(editDisplayText('encoders', 0, enc, 'type')).toBe('CCAb');
    expect(editDisplayText('encoders', 0, enc, 'mode')).toBe('Acc3');
    expect(editDisplayText('encoders', 0, enc, 'channel')).toBe('Ch05');
    expect(editDisplayText('encoders', 0, enc, 'number')).toBe('n064');
    expect(editDisplayText('encoders', 0, enc, 'lower')).toBe('L000');
    expect(editDisplayText('encoders', 0, enc, 'upper')).toBe('U127');
  });
  it('shows ---- for a property the control kind does not have', () => {
    expect(editDisplayText('pushButtons', 0, { ...enc }, 'display')).toBe('----');
  });
  it('only uses characters the glyph table can draw, ignoring case', () => {
    for (const text of ['Std', 'CCAb', 'Acc3', 'toGL', 'JMP', 'SnAP', 'bPoL', 'EXt', 'Ch16', 'n000', 'L127', 'U000', 'Enc1', 'Pbt8', 'FAd9', 'btn3', '----', 'CCr1', 'PrGC', 'Pbnd', 'AFtt', 'notE'])
      for (const ch of text) expect(GLYPHS[ch] ?? GLYPHS[ch.toLowerCase()], `${text}: ${ch}`).toBeDefined();
  });
});
