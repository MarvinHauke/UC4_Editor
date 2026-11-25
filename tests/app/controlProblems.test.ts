import { describe, expect, it } from 'vitest';
import { problemText, problemsOf } from '../../src/app/controlProblems.ts';

const at = 'setups[0].encoderGroups[2].encoders[3]';
describe('problemText', () => {
  it('names the property by its UI label', () => {
    expect(problemText({ path: `${at}.upper`, message: 'upper must be a whole number 0–127' })).toBe('Upper value must be a whole number 0–127');
    expect(problemText({ path: `${at}.channel`, message: 'channel must be a whole number 1–16' })).toBe('MIDI channel must be a whole number 1–16');
    expect(problemText({ path: `${at}.mode`, message: 'mode must be one of a b, found "x"' })).toBe('Acceleration must be one of a b, found "x"');
  });
  it('uses the label of the control kind', () => {
    expect(problemText({ path: 'setups[0].faderButtonGroups[0].buttons[1].mode', message: 'mode must be one of a' })).toMatch(/^Button mode /);
  });
  it('leaves other paths and messages alone', () => {
    expect(problemText({ path: 'setups[0].slot', message: 'slot must be a whole number 1–18' })).toBe('slot must be a whole number 1–18');
    expect(problemText({ path: `${at}`, message: 'must be an object' })).toBe('must be an object');
    expect(problemText({ path: `${at}.upper`, message: 'something else' })).toBe('something else');
  });
  it('is what problemsOf returns', () => {
    expect(problemsOf([{ path: `${at}.upper`, message: 'upper must be x' }], at)[0]).toEqual({ property: 'upper', message: 'Upper value must be x' });
  });
});
