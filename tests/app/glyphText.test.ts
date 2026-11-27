import { describe, expect, it } from 'vitest';
import { glyphNumber } from '../../src/app/glyphText.ts';

describe('glyphNumber', () => {
  it('shows the number for the types that send it', () => {
    expect(glyphNumber('encoders', { type: 'CCAb', number: 8 })).toBe('8');
    expect(glyphNumber('buttons', { type: 'notE', number: 64 })).toBe('64');
  });
  it('shows a program change button\'s Upper, and an encoder or fader\'s Lower–Upper', () => {
    expect(glyphNumber('buttons', { type: 'PrGC', number: 64, lower: 0, upper: 5 })).toBe('5');
    expect(glyphNumber('pushButtons', { type: 'PrGC', number: 0, lower: 0, upper: 127 })).toBe('127');
    expect(glyphNumber('faders', { type: 'PrGC', number: 32, lower: 0, upper: 127 })).toBe('0–127');
    expect(glyphNumber('encoders', { type: 'PrGC', number: 9, lower: 3, upper: 3 })).toBe('3');
  });
  it('shows no number for pitch bend and aftertouch', () => {
    expect(glyphNumber('faders', { type: 'Pbnd', number: 5 })).toBe('');
    expect(glyphNumber('encoders', { type: 'AFtt', number: 5 })).toBe('');
  });
});
