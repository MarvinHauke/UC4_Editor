import { describe, expect, it } from 'vitest';
import { CROSSFADER, GEOMETRY, groupPitch } from '../../src/app/profile/uc4Geometry.ts';

describe('groupPitch', () => {
  it('is the spacing of the first two encoders in the upper area', () => {
    const [a, b] = GEOMETRY.encoders as { cx: number }[];
    expect(groupPitch('upper')).toBe(b!.cx - a!.cx);
  });
  it('is the spacing of the first two faders in the lower area', () => {
    const [a, b] = GEOMETRY.faders as { x: number; width: number }[];
    expect(groupPitch('lower')).toBe(b!.x - a!.x);
  });
  it('has the literal pitches of the drawn panel', () => {
    expect(groupPitch('upper')).toBe(133);
    expect(groupPitch('lower')).toBe(65);
  });
  it('names the horizontal fader as the crossfader', () => {
    const f = GEOMETRY.faders[CROSSFADER] as { horizontal: boolean };
    expect(f.horizontal).toBe(true);
    expect(GEOMETRY.faders.filter((x) => (x as { horizontal: boolean }).horizontal)).toHaveLength(1);
  });
});
